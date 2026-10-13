/**
 * Membership + invite infrastructure wiring for Route Handlers (UTA-70).
 *
 * - Stores mirror `@/lib/auth`: Postgres (`DATABASE_URL` set) through the
 *   Drizzle invite/member stores, otherwise process-local in-memory stores
 *   (local-dev/fixture mode; responses include `storage: "memory"`).
 * - Authorization is server-side only: `requireWorkspaceAdmin` validates
 *   the session token, then resolves the caller's membership from the
 *   member store keyed by the authenticated user id + the path workspace
 *   id. Client-supplied roles are never trusted (deny-by-default).
 * - Secrets/PII discipline: tokens, hashes, and invitee emails are never
 *   logged — log references (inviteId, memberId, sessionId) only.
 */
import {
  DrizzleInviteStore,
  createDb,
  type DbHandle,
} from '@tokoboss/database';
import {
  InMemoryInviteStore,
  toContext,
  validatePassword,
  type WorkspaceContext,
  type WorkspaceInviteStore,
  type WorkspaceMemberRecord,
} from '@tokoboss/application';
import type { MemberView } from '@tokoboss/contracts';
import {
  slideSessionCookie,
  storageKind,
  type ValidatedRequest,
} from '@/lib/auth';
import {
  requireWorkspaceMember,
  type WorkspaceMemberDenial,
} from '@/lib/workspace-access';

let dbHandle: DbHandle | null = null;
let memoryInvites: InMemoryInviteStore | null = null;

function getDbHandle(): DbHandle {
  if (!dbHandle) dbHandle = createDb(process.env['DATABASE_URL']);
  return dbHandle;
}

function getMemoryInvites(): InMemoryInviteStore {
  if (!memoryInvites) memoryInvites = new InMemoryInviteStore();
  return memoryInvites;
}

export function getInviteStore(): WorkspaceInviteStore {
  if (storageKind() === 'postgres') {
    return new DrizzleInviteStore(getDbHandle().db);
  }
  return getMemoryInvites();
}

/**
 * Reset process-local invite state. Test seam for `web/src/__tests__`;
 * call alongside `__resetAuthForTests`. Refuses production.
 */
export function __resetMembershipForTests(): void {
  if (
    process.env['APP_ENV'] === 'production' ||
    process.env['VERCEL_ENV'] === 'production'
  ) {
    throw new Error('Refusing fixture reset in production');
  }
  memoryInvites = new InMemoryInviteStore();
}

export interface AdminRequest {
  ctx: WorkspaceContext;
  validated: ValidatedRequest;
}

export type AdminDenial =
  | WorkspaceMemberDenial
  | { status: 403; error: string; errorCode: 'TENANCY_FORBIDDEN' };

/**
 * Authenticate the request and admit the caller to the TARGET workspace
 * (path param) via `requireWorkspaceMember`: missing/invalid session 401,
 * any no-access case the neutral 404 `WORKSPACE_NOT_AVAILABLE`. An active
 * member whose role is not Admin gets 403 `TENANCY_FORBIDDEN`.
 */
export async function requireWorkspaceAdmin(
  request: Request,
  workspaceId: string
): Promise<
  { ok: true; value: AdminRequest } | { ok: false; denial: AdminDenial }
> {
  const member = await requireWorkspaceMember(request, workspaceId);
  if (!member.ok) return { ok: false, denial: member.denial };
  const ctx = toContext(member.value.membership);
  if (ctx.role !== 'admin') {
    return {
      ok: false,
      denial: {
        status: 403,
        error: 'Cross-workspace access denied',
        errorCode: 'TENANCY_FORBIDDEN',
      },
    };
  }
  return { ok: true, value: { ctx, validated: member.value.validated } };
}

/** Refreshed `Set-Cookie` for cookie-authenticated web Admins (may be `undefined`). */
export function slideForAdmin(admin: AdminRequest): string | undefined {
  return slideSessionCookie(admin.validated);
}

/** Client-safe member projection (opaque ids only, no PII). */
export function toMemberView(m: WorkspaceMemberRecord): MemberView {
  return {
    id: m.id,
    workspaceId: m.workspaceId,
    userId: m.userId,
    role: m.role,
    warehouseScope: m.warehouseScope,
    status: m.status,
    authVersion: m.authVersion,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

/** Shared password-policy hook for invite-accept provisioning (UTA-17). */
export const invitePasswordPolicy = {
  validate(password: unknown): void {
    validatePassword(password);
  },
};

/**
 * Map application-layer errors to HTTP status codes. Messages from the
 * use-cases are client-safe by design (no identifiers, no secrets), so
 * they pass through; unknown failures collapse to a generic 500.
 */
export function membershipErrorStatus(err: unknown): {
  status: number;
  errorCode: string;
} {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  const message = err instanceof Error ? err.message : '';
  // Store-level uniqueness conflicts surface as plain Errors
  // (`MEMBERSHIP_CONFLICT: …`) — map them before the generic fallback.
  if (message.startsWith('MEMBERSHIP_CONFLICT')) {
    return { status: 409, errorCode: 'MEMBERSHIP_CONFLICT' };
  }
  if (message.startsWith('INVITE_CONFLICT')) {
    return { status: 409, errorCode: 'INVITE_CONFLICT' };
  }
  switch (code) {
    case 'TENANCY_FORBIDDEN':
      return { status: 403, errorCode: 'TENANCY_FORBIDDEN' };
    case 'TENANCY_LAST_ADMIN':
      return { status: 409, errorCode: 'TENANCY_LAST_ADMIN' };
    case 'TENANCY_VALIDATION':
      return { status: 400, errorCode: 'TENANCY_VALIDATION' };
    case 'INVITE_INVALID':
      return { status: 404, errorCode: 'INVITE_INVALID' };
    case 'INVITE_EXPIRED':
      return { status: 410, errorCode: 'INVITE_EXPIRED' };
    case 'INVITE_CONFLICT':
      return { status: 409, errorCode: 'INVITE_CONFLICT' };
    case 'MEMBERSHIP_CONFLICT':
      return { status: 409, errorCode: 'MEMBERSHIP_CONFLICT' };
    default:
      return { status: 500, errorCode: 'MEMBERSHIP_FAILED' };
  }
}
