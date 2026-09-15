import { randomBytes } from 'node:crypto';
import { hashInviteToken, mintInviteToken } from './invite-crypto';
import {
  InviteConflictError,
  InviteExpiredError,
  InviteInvalidError,
} from './invite-errors';
import type {
  InviteCredentialStore,
  InvitePasswordHasher,
  WorkspaceInviteStore,
} from './invite-ports';
import {
  INVITE_DEFAULT_TTL_MS,
  INVITE_MAX_TTL_MS,
  toInviteView,
  type WorkspaceInviteView,
} from './invite-types';
import type {
  SessionRevoker,
  TenancyAuditSink,
  WorkspaceMemberStore,
} from './tenancy-ports';
import {
  requireRole,
  requireUserId,
  requireWarehouseScope,
  requireWorkspaceId,
  assertTenancyPayloadSafe,
} from './tenancy-safety';
import { assertSameWorkspace } from './workspace-context';
import { changeMember } from './tenancy-use-cases';
import {
  TenancyForbiddenError,
  TenancyValidationError,
} from './tenancy-errors';
import type { WorkspaceContext, WorkspaceMemberRecord } from './tenancy-types';

const EMAIL_SHAPE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normalize an invitee email: trim + lowercase. Never logged. */
export function normalizeInviteEmail(email: string): string {
  return (email ?? '').trim().toLowerCase();
}

function requireInviteEmail(email: unknown): string {
  const normalized =
    typeof email === 'string' ? normalizeInviteEmail(email) : '';
  if (normalized.length === 0 || normalized.length > 320) {
    throw new TenancyValidationError('email must not be empty');
  }
  if (!EMAIL_SHAPE_RE.test(normalized)) {
    throw new TenancyValidationError('email must be a valid email address');
  }
  return normalized;
}

function auditPayload(
  payload: Record<string, unknown>,
  label: string
): Record<string, unknown> {
  assertTenancyPayloadSafe(payload, label);
  return payload;
}

/** Clamp invite TTL: default 7d, max 30d, must be positive. */
export function resolveInviteTtlMs(ttlMs: unknown): number {
  if (ttlMs === undefined || ttlMs === null) return INVITE_DEFAULT_TTL_MS;
  if (typeof ttlMs !== 'number' || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new TenancyValidationError('ttlMs must be a positive duration');
  }
  return Math.min(Math.floor(ttlMs), INVITE_MAX_TTL_MS);
}

export interface CreateInviteInput {
  ctx: WorkspaceContext;
  workspaceId: string;
  email: string;
  role: WorkspaceMemberRecord['role'];
  warehouseScope?: string | null;
  /** Lifetime override (ms). Defaults to 7d, capped at 30d. */
  ttlMs?: number;
  actorType?: string;
  correlationId?: string;
  now?: Date;
}

export interface CreateInviteResult {
  /** Client-safe projection (returned to the inviting Admin). */
  invite: WorkspaceInviteView;
  /** Opaque bearer token — returned once, stored only as a hash. */
  token: string;
}

/**
 * Create an invite ticket. Admin-only; cross-workspace denied.
 *
 * Rejects when a pending non-expired ticket already covers this
 * workspace+email, or when the email already holds an active membership
 * (credential lookup is best-effort — pass the credential store when the
 * caller has one). The audit event carries opaque ids only (no email, no
 * token); the email lives solely in the invite row.
 */
export async function createInvite(
  invites: WorkspaceInviteStore,
  members: WorkspaceMemberStore,
  input: CreateInviteInput,
  audit?: TenancyAuditSink,
  credentials?: InviteCredentialStore
): Promise<CreateInviteResult> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  if (input.ctx.role !== 'admin') {
    throw new TenancyForbiddenError('Only Admin may invite members');
  }
  const workspaceId = requireWorkspaceId(input.workspaceId);
  const email = requireInviteEmail(input.email);
  const role = requireRole(input.role);
  const scope = requireWarehouseScope(role, input.warehouseScope);
  const ttlMs = resolveInviteTtlMs(input.ttlMs);
  const now = input.now ?? new Date();

  const pending = await invites.findPendingByWorkspaceAndEmail(
    workspaceId,
    email,
    now
  );
  if (pending) throw new InviteConflictError();

  if (credentials) {
    const credential = await credentials.findByEmail(email);
    if (credential) {
      const existing = await members.findByWorkspaceAndUser(
        workspaceId,
        credential.userId
      );
      if (existing && existing.status === 'active') {
        throw new InviteConflictError();
      }
    }
  }

  const token = mintInviteToken();
  const created = await invites.create({
    workspaceId,
    email,
    role,
    warehouseScope: scope,
    tokenHash: hashInviteToken(token),
    expiresAt: new Date(now.getTime() + ttlMs),
    invitedBy: input.ctx.userId,
  });

  if (audit) {
    await audit.append({
      workspaceId,
      action: 'invite.created',
      category: 'invite',
      actorType: input.actorType ?? 'user',
      actorId: input.ctx.userId,
      correlationId: input.correlationId,
      payload: auditPayload(
        {
          workspaceId,
          inviteId: created.id,
          role,
          warehouseScope: scope,
          invitedBy: input.ctx.userId,
          expiresAt: created.expiresAt.toISOString(),
        },
        'invite.created'
      ),
    });
  }
  return { invite: toInviteView(created), token };
}

export interface RevokeInviteInput {
  ctx: WorkspaceContext;
  workspaceId: string;
  inviteId: string;
  actorType?: string;
  correlationId?: string;
}

/**
 * Revoke a pending invite. Admin-only; cross-workspace denied. Consumed
 * (accepted/revoked/expired) tickets cannot be revoked (`InviteInvalidError`,
 * generic so callers learn nothing about other workspaces' tickets).
 */
export async function revokeInvite(
  invites: WorkspaceInviteStore,
  input: RevokeInviteInput,
  audit?: TenancyAuditSink
): Promise<void> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  if (input.ctx.role !== 'admin') {
    throw new TenancyForbiddenError('Only Admin may revoke invites');
  }
  const workspaceId = requireWorkspaceId(input.workspaceId);
  const inviteId = (input.inviteId ?? '').trim();
  if (inviteId.length === 0) {
    throw new TenancyValidationError('inviteId must not be empty');
  }
  const invite = await invites.findById(inviteId, workspaceId);
  if (!invite) throw new TenancyForbiddenError();
  if (invite.status !== 'pending') throw new InviteInvalidError();
  await invites.update(invite.id, workspaceId, { status: 'revoked' });
  if (audit) {
    await audit.append({
      workspaceId,
      action: 'invite.revoked',
      category: 'invite',
      actorType: input.actorType ?? 'user',
      actorId: input.ctx.userId,
      correlationId: input.correlationId,
      payload: auditPayload(
        { workspaceId, inviteId: invite.id },
        'invite.revoked'
      ),
    });
  }
}

export interface ListInvitesInput {
  ctx: WorkspaceContext;
  workspaceId: string;
}

/** List invite tickets (Admin-only; views carry email for Admin triage). */
export async function listInvites(
  invites: WorkspaceInviteStore,
  input: ListInvitesInput
): Promise<WorkspaceInviteView[]> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  if (input.ctx.role !== 'admin') {
    throw new TenancyForbiddenError('Only Admin may list invites');
  }
  const rows = await invites.listByWorkspace(
    requireWorkspaceId(input.workspaceId)
  );
  return rows
    .slice()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(toInviteView);
}

export interface ListMembersInput {
  ctx: WorkspaceContext;
  workspaceId: string;
}

/**
 * List workspace members. Admin-only; cross-workspace denied. Records
 * carry opaque user ids only (no PII), so the projection is safe to
 * return as-is.
 */
export async function listMembers(
  members: WorkspaceMemberStore,
  input: ListMembersInput
): Promise<WorkspaceMemberRecord[]> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  if (input.ctx.role !== 'admin') {
    throw new TenancyForbiddenError('Only Admin may list members');
  }
  return members.listByWorkspace(requireWorkspaceId(input.workspaceId));
}

export interface DeactivateMemberInput {
  ctx: WorkspaceContext;
  workspaceId: string;
  targetUserId: string;
  actorType?: string;
  correlationId?: string;
}

/**
 * Deactivate a member: role/scope/status change with `auth_version` bump
 * (via `changeMember`, so the last-active-Admin invariant holds), session
 * rows revoked now (not lazily), and `security.forced_sign_out`
 * (`admin_deactivate`) emitted. Admin-only; cross-workspace denied.
 */
export async function deactivateMember(
  members: WorkspaceMemberStore,
  input: DeactivateMemberInput,
  audit?: TenancyAuditSink,
  sessions?: SessionRevoker
): Promise<WorkspaceMemberRecord> {
  return changeMember(
    members,
    {
      ctx: input.ctx,
      workspaceId: input.workspaceId,
      targetUserId: input.targetUserId,
      status: 'deactivated',
      actorType: input.actorType,
      correlationId: input.correlationId,
    },
    audit,
    sessions
  );
}

export interface PasswordPolicyHook {
  validate(password: unknown): void;
}

export interface AcceptInviteInput {
  /** Opaque bearer token from the invite (token-gated — no session needed). */
  token: string;
  /**
   * Claim the ticket as an existing user id. When a credential already
   * exists for the invite email it MUST match that credential's user id;
   * when none exists it selects the new membership's user id (generated
   * when omitted). Never an email (opaque ids only).
   */
  userId?: string;
  /**
   * Provision a password credential for the invite email when none exists
   * yet. Requires the caller's `hasher`; policy-checked (min 8 server-side,
   * plus the shared denylist when the `passwordPolicy` hook is provided).
   * Omit for membership-only accept (credential added later).
   */
  password?: string;
  correlationId?: string;
  now?: Date;
}

export interface AcceptInviteDeps {
  invites: WorkspaceInviteStore;
  members: WorkspaceMemberStore;
  audit?: TenancyAuditSink;
  credentials?: InviteCredentialStore;
  hasher?: InvitePasswordHasher;
  passwordPolicy?: PasswordPolicyHook;
}

export interface AcceptInviteResult {
  membership: WorkspaceMemberRecord;
  userId: string;
  /** True when a credential row was provisioned during this accept. */
  isNewUser: boolean;
  /** False when the membership already existed (idempotent re-accept). */
  isNewMember: boolean;
}

function generateInviteUserId(): string {
  return `user_inv_${randomBytes(8).toString('hex')}`;
}

function assertAcceptablePassword(
  password: unknown,
  policy?: PasswordPolicyHook
): asserts password is string {
  if (typeof password !== 'string' || password.length < 8) {
    throw new TenancyValidationError('Password must be at least 8 characters.');
  }
  if (password.length > 512) {
    throw new TenancyValidationError('Password is too long.');
  }
  policy?.validate(password);
}

/**
 * Accept an invite ticket (token-gated, no session required).
 *
 * Invalid/consumed tokens are rejected generically (`InviteInvalidError`);
 * expired tickets are stamped `expired` and rejected (`InviteExpiredError`)
 * so they can never be retried into validity. Accepting binds the ticket's
 * workspace+role+scope to a membership: existing active memberships make
 * the accept idempotent, deactivated memberships are reactivated onto the
 * ticket's role/scope (with an `auth_version` bump), and otherwise a fresh
 * membership is created. Audit events carry opaque ids only — the invitee
 * email and the token never appear in payloads or logs.
 */
export async function acceptInvite(
  deps: AcceptInviteDeps,
  input: AcceptInviteInput
): Promise<AcceptInviteResult> {
  const rawToken = typeof input.token === 'string' ? input.token.trim() : '';
  if (rawToken.length === 0) throw new InviteInvalidError();
  const now = input.now ?? new Date();

  const invite = await deps.invites.findByTokenHash(hashInviteToken(rawToken));
  if (!invite) throw new InviteInvalidError();
  if (invite.status === 'accepted' || invite.status === 'revoked') {
    throw new InviteInvalidError();
  }
  if (
    invite.status === 'expired' ||
    invite.expiresAt.getTime() <= now.getTime()
  ) {
    if (invite.status === 'pending') {
      await deps.invites.update(invite.id, invite.workspaceId, {
        status: 'expired',
      });
      if (deps.audit) {
        await deps.audit.append({
          workspaceId: invite.workspaceId,
          action: 'invite.expired',
          category: 'invite',
          actorType: 'system',
          correlationId: input.correlationId,
          payload: auditPayload(
            { workspaceId: invite.workspaceId, inviteId: invite.id },
            'invite.expired'
          ),
        });
      }
    }
    throw new InviteExpiredError();
  }

  const email = normalizeInviteEmail(invite.email);
  const priorCredential = await deps.credentials?.findByEmail(email);
  let targetUserId: string;
  let isNewUser = false;

  if (priorCredential) {
    if (input.userId !== undefined) {
      const claimed = requireUserId(input.userId);
      if (claimed !== priorCredential.userId) {
        throw new TenancyValidationError(
          'Invite ticket does not belong to this user'
        );
      }
    }
    targetUserId = priorCredential.userId;
  } else {
    targetUserId =
      input.userId !== undefined
        ? requireUserId(input.userId)
        : generateInviteUserId();
    if (input.password !== undefined) {
      if (!deps.credentials || !deps.hasher) {
        throw new TenancyValidationError(
          'Password provisioning is not available'
        );
      }
      assertAcceptablePassword(input.password, deps.passwordPolicy);
      const passwordHash = await deps.hasher.hash(input.password);
      try {
        await deps.credentials.create({
          email,
          userId: targetUserId,
          passwordHash,
        });
        isNewUser = true;
      } catch (err) {
        // Lost a race with a concurrent accept: rebind to the winner when
        // it owns this email, otherwise stay generic.
        const winner = await deps.credentials.findByEmail(email);
        if (!winner) throw err;
        if (input.userId !== undefined && winner.userId !== targetUserId) {
          throw new TenancyValidationError(
            'Invite ticket does not belong to this user'
          );
        }
        targetUserId = winner.userId;
        isNewUser = false;
      }
    }
  }

  const existing = await deps.members.findByWorkspaceAndUser(
    invite.workspaceId,
    targetUserId
  );
  if (existing && existing.status === 'active') {
    await deps.invites.update(invite.id, invite.workspaceId, {
      status: 'accepted',
      acceptedAt: now,
    });
    if (deps.audit) {
      await deps.audit.append({
        workspaceId: invite.workspaceId,
        action: 'invite.accepted',
        category: 'invite',
        actorType: 'user',
        actorId: targetUserId,
        correlationId: input.correlationId,
        payload: auditPayload(
          {
            workspaceId: invite.workspaceId,
            inviteId: invite.id,
            userId: targetUserId,
            role: invite.role,
          },
          'invite.accepted'
        ),
      });
    }
    return {
      membership: existing,
      userId: targetUserId,
      isNewUser,
      isNewMember: false,
    };
  }

  let membership: WorkspaceMemberRecord;
  if (existing) {
    membership = await deps.members.update(existing.id, invite.workspaceId, {
      role: invite.role,
      warehouseScope: invite.warehouseScope,
      status: 'active',
      authVersion: existing.authVersion + 1,
    });
  } else {
    membership = await deps.members.create({
      workspaceId: invite.workspaceId,
      userId: targetUserId,
      role: invite.role,
      warehouseScope: invite.warehouseScope,
      status: 'active',
    });
  }
  await deps.invites.update(invite.id, invite.workspaceId, {
    status: 'accepted',
    acceptedAt: now,
  });

  if (deps.audit) {
    await deps.audit.append({
      workspaceId: invite.workspaceId,
      action: 'invite.accepted',
      category: 'invite',
      actorType: 'user',
      actorId: targetUserId,
      correlationId: input.correlationId,
      payload: auditPayload(
        {
          workspaceId: invite.workspaceId,
          inviteId: invite.id,
          userId: targetUserId,
          role: invite.role,
        },
        'invite.accepted'
      ),
    });
    await deps.audit.append({
      workspaceId: invite.workspaceId,
      action: existing ? 'membership.status_changed' : 'membership.added',
      category: 'membership',
      actorType: 'user',
      actorId: targetUserId,
      correlationId: input.correlationId,
      payload: auditPayload(
        existing
          ? {
              workspaceId: invite.workspaceId,
              userId: targetUserId,
              from: {
                role: existing.role,
                warehouseScope: existing.warehouseScope,
                status: existing.status,
              },
              to: {
                role: invite.role,
                warehouseScope: invite.warehouseScope,
                status: 'active' as const,
              },
              authVersion: membership.authVersion,
            }
          : {
              workspaceId: invite.workspaceId,
              userId: targetUserId,
              role: invite.role,
              warehouseScope: invite.warehouseScope,
            },
        'membership.accept'
      ),
    });
  }

  return { membership, userId: targetUserId, isNewUser, isNewMember: true };
}
