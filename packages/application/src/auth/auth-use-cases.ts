import type { AuthPlatform, SessionRecord, SessionView } from './auth-types';
import {
  SESSION_IDLE_TTL_MS,
  isAuthPlatform,
  toSessionView,
} from './auth-types';
import {
  InvalidCredentialsError,
  PasswordPolicyError,
  PasswordResetError,
  RateLimitedError,
} from './auth-errors';
import { normalizeEmail, validatePassword } from './password-policy';
import { hashToken, mintToken } from './crypto';
import { rateLimitKey, type SignInRateLimiter } from './rate-limit';
import type {
  CredentialStore,
  PasswordHasher,
  PasswordResetStore,
  SessionStore,
} from './auth-ports';
import type {
  TenancyAuditSink,
  WorkspaceMemberStore,
} from '../tenancy/tenancy-ports';
import { emitSecurityEvent } from '../tenancy/tenancy-use-cases';

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export interface AuthDeps {
  credentials: CredentialStore;
  sessions: SessionStore;
  resets: PasswordResetStore;
  members: WorkspaceMemberStore;
  hasher: PasswordHasher;
  audit: TenancyAuditSink;
  rateLimiter: SignInRateLimiter;
}

/** True when the sliding idle window has elapsed. No absolute expiry. */
export function isIdleExpired(
  platform: AuthPlatform,
  lastSeenAt: Date,
  nowMs = Date.now()
): boolean {
  const ttl = SESSION_IDLE_TTL_MS[platform] ?? SESSION_IDLE_TTL_MS.web;
  return nowMs - lastSeenAt.getTime() >= ttl;
}

export interface SignInInput {
  email: string;
  password: string;
  workspaceId: string;
  platform: AuthPlatform | string;
  deviceLabel?: string | null;
  ip?: string;
  correlationId?: string;
}

export interface SignInResult {
  /** Opaque bearer token — returned once, stored only as a hash. */
  token: string;
  session: SessionView;
  userId: string;
  workspaceId: string;
}

/**
 * Sign in with email + password. Creates one session row (unlimited
 * concurrent devices). Failures are generic (`InvalidCredentialsError`)
 * whether the email is unknown, the password is wrong, or the membership
 * is missing/deactivated — and every failure path emits
 * `security.sign_in_failed` with identifier-free payloads.
 */
export async function signIn(
  deps: AuthDeps,
  input: SignInInput
): Promise<SignInResult> {
  const email = normalizeEmail(input.email ?? '');
  const workspaceId = (input.workspaceId ?? '').trim();
  const platform: AuthPlatform = isAuthPlatform(input.platform)
    ? input.platform
    : 'web';
  const key = rateLimitKey(email || 'unknown', input.ip);
  const now = new Date();

  if (workspaceId.length === 0) {
    throw new InvalidCredentialsError();
  }

  try {
    deps.rateLimiter.check(key, now.getTime());
  } catch {
    // Rate-limited failures still emit the security event (the route's 429
    // path) without leaking which identifier was attacked.
    await emitSecurityEvent(deps.audit, {
      workspaceId,
      action: 'security.sign_in_failed',
      correlationId: input.correlationId,
      payload: { workspaceId },
    });
    throw new RateLimitedError();
  }

  const fail = async (): Promise<never> => {
    deps.rateLimiter.recordFailure(key, Date.now());
    await emitSecurityEvent(deps.audit, {
      workspaceId,
      action: 'security.sign_in_failed',
      correlationId: input.correlationId,
      payload: { workspaceId },
    });
    throw new InvalidCredentialsError();
  };

  if (email.length === 0 || typeof input.password !== 'string') {
    return fail();
  }
  const credential = await deps.credentials.findByEmail(email);
  if (!credential) return fail();
  const ok = await deps.hasher.verify(credential.passwordHash, input.password);
  if (!ok) return fail();

  const membership = await deps.members.findByWorkspaceAndUser(
    workspaceId,
    credential.userId
  );
  if (!membership || membership.status !== 'active') return fail();

  const token = mintToken();
  const deviceLabel =
    typeof input.deviceLabel === 'string' && input.deviceLabel.trim().length > 0
      ? input.deviceLabel.trim().slice(0, 120)
      : null;
  const created = await deps.sessions.create({
    userId: credential.userId,
    workspaceId,
    platform,
    deviceLabel,
    tokenHash: hashToken(token),
    authVersion: membership.authVersion,
    lastSeenAt: now,
  });

  deps.rateLimiter.reset(key);
  await emitSecurityEvent(deps.audit, {
    workspaceId,
    action: 'security.sign_in_succeeded',
    actorId: credential.userId,
    correlationId: input.correlationId,
    payload: {
      workspaceId,
      userId: credential.userId,
      authVersion: membership.authVersion,
    },
  });

  return {
    token,
    session: toSessionView(created),
    userId: credential.userId,
    workspaceId,
  };
}

export interface ValidateSessionResult {
  session: SessionRecord;
  userId: string;
  workspaceId: string;
  authVersion: number;
}

/**
 * Validate a bearer token: unknown/revoked → null; idle-expired →
 * revoked + null; membership auth-stale or deactivated → revoked + null.
 * Fresh sessions get `last_seen` touched (sliding idle clock, never an
 * absolute logout).
 */
export async function validateSession(
  deps: AuthDeps,
  token: string,
  nowMs = Date.now()
): Promise<ValidateSessionResult | null> {
  if (typeof token !== 'string' || token.length === 0) return null;
  const row = await deps.sessions.findByTokenHash(hashToken(token));
  if (!row || row.revokedAt) return null;
  const now = new Date(nowMs);
  if (isIdleExpired(row.platform, row.lastSeenAt, nowMs)) {
    await deps.sessions.markRevoked(row.id, now);
    return null;
  }
  const membership = await deps.members.findByWorkspaceAndUser(
    row.workspaceId,
    row.userId
  );
  if (
    !membership ||
    membership.status !== 'active' ||
    membership.authVersion !== row.authVersion
  ) {
    // Password reset / Admin deactivate bump `auth_version`: the session is
    // dead even with idle time left. Mark revoked so `listSessions` hides it.
    await deps.sessions.markRevoked(row.id, now);
    return null;
  }
  await deps.sessions.touch(row.id, now);
  return {
    session: { ...row, lastSeenAt: now },
    userId: row.userId,
    workspaceId: row.workspaceId,
    authVersion: membership.authVersion,
  };
}

/** Revoke one session by token (sign out this device). Idempotent. */
export async function signOut(
  deps: AuthDeps,
  token: string,
  now = new Date()
): Promise<{ revoked: boolean }> {
  if (typeof token !== 'string' || token.length === 0)
    return { revoked: false };
  const revoked = await deps.sessions.revokeByTokenHash(hashToken(token), now);
  return { revoked };
}

export interface SignOutAllInput {
  userId: string;
  workspaceId: string;
  actorId?: string;
  correlationId?: string;
}

/**
 * Revoke every session for a user (sign out all devices). Emits
 * `security.forced_sign_out` (`admin_revoke`) so the audit trail shows the
 * mass revocation.
 */
export async function signOutAll(
  deps: AuthDeps,
  input: SignOutAllInput,
  now = new Date()
): Promise<{ revokedCount: number }> {
  const revokedCount = await deps.sessions.revokeAllByUser(input.userId, now);
  await emitSecurityEvent(deps.audit, {
    workspaceId: input.workspaceId,
    action: 'security.forced_sign_out',
    actorId: input.actorId ?? input.userId,
    correlationId: input.correlationId,
    payload: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      reason: 'admin_revoke',
    },
  });
  return { revokedCount };
}

/** List active (non-revoked, idle-fresh) sessions for a user. */
export async function listSessions(
  deps: AuthDeps,
  userId: string,
  nowMs = Date.now()
): Promise<SessionView[]> {
  const rows = await deps.sessions.listByUser(userId);
  return rows
    .filter(
      (r) => !r.revokedAt && !isIdleExpired(r.platform, r.lastSeenAt, nowMs)
    )
    .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
    .map(toSessionView);
}

export interface RequestPasswordResetInput {
  email: string;
  correlationId?: string;
}

/**
 * Start a password reset. Always succeeds with the same shape whether the
 * email exists (no enumeration oracle). The reset token is returned to the
 * caller so the MVP fixture flow (no mailer yet) can complete it; routes
 * must only expose it in local-fixture mode.
 */
export async function requestPasswordReset(
  deps: AuthDeps,
  input: RequestPasswordResetInput,
  now = new Date()
): Promise<{ resetToken: string | null }> {
  const email = normalizeEmail(input.email ?? '');
  if (email.length === 0) return { resetToken: null };
  const credential = await deps.credentials.findByEmail(email);
  if (!credential) return { resetToken: null };
  const resetToken = mintToken();
  await deps.resets.create({
    userId: credential.userId,
    tokenHash: hashToken(resetToken),
    expiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
  });
  return { resetToken };
}

export interface ConfirmPasswordResetInput {
  resetToken: string;
  newPassword: string;
  correlationId?: string;
}

/**
 * Complete a password reset: policy-check the new password, rotate the
 * hash, revoke ALL sessions, bump EVERY membership `auth_version` (so even
 * sessions validated against a stale read fail), and emit
 * `security.password_reset` + `security.forced_sign_out`.
 */
export async function confirmPasswordReset(
  deps: AuthDeps,
  input: ConfirmPasswordResetInput,
  now = new Date()
): Promise<{ userId: string }> {
  if (typeof input.resetToken !== 'string' || input.resetToken.length === 0) {
    throw new PasswordResetError();
  }
  try {
    validatePassword(input.newPassword);
  } catch (err) {
    if (err instanceof PasswordPolicyError) throw err;
    throw new PasswordPolicyError();
  }
  const ticket = await deps.resets.findByTokenHash(hashToken(input.resetToken));
  if (!ticket || ticket.usedAt || ticket.expiresAt.getTime() <= now.getTime()) {
    throw new PasswordResetError();
  }
  const passwordHash = await deps.hasher.hash(input.newPassword);
  await deps.credentials.updatePasswordHash(ticket.userId, passwordHash);
  await deps.resets.markUsed(ticket.id, now);
  await deps.sessions.revokeAllByUser(ticket.userId, now);

  // Bump auth_version on every membership so all pre-reset sessions are
  // auth-stale even if a session row was missed.
  const memberships = await deps.members.listByUser(ticket.userId);
  let primaryWorkspaceId = '';
  for (const m of memberships) {
    if (!primaryWorkspaceId) primaryWorkspaceId = m.workspaceId;
    await deps.members.update(m.id, m.workspaceId, {
      authVersion: m.authVersion + 1,
    });
  }
  if (primaryWorkspaceId) {
    await emitSecurityEvent(deps.audit, {
      workspaceId: primaryWorkspaceId,
      action: 'security.password_reset',
      actorId: ticket.userId,
      correlationId: input.correlationId,
      payload: { workspaceId: primaryWorkspaceId, userId: ticket.userId },
    });
    await emitSecurityEvent(deps.audit, {
      workspaceId: primaryWorkspaceId,
      action: 'security.forced_sign_out',
      actorId: ticket.userId,
      correlationId: input.correlationId,
      payload: {
        workspaceId: primaryWorkspaceId,
        userId: ticket.userId,
        reason: 'password_reset',
      },
    });
  }
  return { userId: ticket.userId };
}
