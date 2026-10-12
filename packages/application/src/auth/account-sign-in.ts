import type { AuthPlatform, SessionView } from './auth-types';
import { isAuthPlatform, toSessionView } from './auth-types';
import { InvalidCredentialsError, RateLimitedError } from './auth-errors';
import { normalizeEmail } from './password-policy';
import { hashToken, mintToken } from './crypto';
import { rateLimitKey, type SignInRateLimiter } from './rate-limit';
import type {
  CredentialStore,
  PasswordHasher,
  SessionStore,
} from './auth-ports';
import type {
  TenancyAuditSink,
  WorkspaceMemberStore,
} from '../tenancy/tenancy-ports';
import { emitAccountSecurityEvent } from '../tenancy/tenancy-use-cases';
import {
  resolveWorkspaceLanding,
  type WorkspaceLandingResult,
} from '../tenancy/workspace-landing';

/** US29 / RFC 02 row 16 — account-level sign-in (no workspaceId). */
export interface AccountSignInDeps {
  credentials: CredentialStore;
  sessions: SessionStore;
  members: WorkspaceMemberStore;
  hasher: PasswordHasher;
  audit: TenancyAuditSink;
  rateLimiter: SignInRateLimiter;
}

export interface AccountSignInInput {
  email: string;
  password: string;
  platform: AuthPlatform | string;
  deviceLabel?: string | null;
  ip?: string;
  correlationId?: string;
}

export interface AccountSignInResult {
  token: string;
  session: SessionView;
  userId: string;
  landing: WorkspaceLandingResult;
}

/** Email+password → NULL-workspace session + landing. Deactivated = generic fail. */
export async function signInAccount(
  deps: AccountSignInDeps,
  input: AccountSignInInput
): Promise<AccountSignInResult> {
  const email = normalizeEmail(input.email ?? '');
  const platform: AuthPlatform = isAuthPlatform(input.platform)
    ? input.platform
    : 'web';
  const key = rateLimitKey(email || 'unknown', input.ip);
  const now = new Date();

  const emitFailed = () =>
    emitAccountSecurityEvent(deps.audit, {
      action: 'security.sign_in_failed',
      correlationId: input.correlationId,
      payload: { reason: 'invalid' },
    });

  try {
    deps.rateLimiter.check(key, now.getTime());
  } catch {
    await emitFailed();
    throw new RateLimitedError();
  }

  const fail = async (): Promise<never> => {
    deps.rateLimiter.recordFailure(key, Date.now());
    await emitFailed();
    throw new InvalidCredentialsError();
  };

  if (email.length === 0 || typeof input.password !== 'string') return fail();
  const credential = await deps.credentials.findByEmail(email);
  if (!credential) return fail();
  if (!(await deps.hasher.verify(credential.passwordHash, input.password))) {
    return fail();
  }
  const state = await deps.credentials.getAccountState(credential.userId);
  if (state?.deactivatedAt != null) return fail();
  const authVersion = state?.authVersion ?? 1;

  const token = mintToken();
  const rawLabel = input.deviceLabel;
  const deviceLabel =
    typeof rawLabel === 'string' && rawLabel.trim().length > 0
      ? rawLabel.trim().slice(0, 120)
      : null;
  const created = await deps.sessions.create({
    userId: credential.userId,
    workspaceId: null,
    platform,
    deviceLabel,
    tokenHash: hashToken(token),
    authVersion,
    lastSeenAt: now,
  });

  deps.rateLimiter.reset(key);
  await emitAccountSecurityEvent(deps.audit, {
    action: 'security.sign_in_succeeded',
    actorId: credential.userId,
    correlationId: input.correlationId,
    payload: { userId: credential.userId, authVersion },
  });

  const landing = await resolveWorkspaceLanding(
    deps.members,
    credential.userId
  );
  return {
    token,
    session: toSessionView(created),
    userId: credential.userId,
    landing,
  };
}
