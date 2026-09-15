import {
  TenancyForbiddenError,
  TenancyValidationError,
} from './tenancy-errors';
import {
  requireWarehouseScope,
  requireWorkspaceId,
} from './tenancy-safety';
import type { WorkspaceMemberStore } from './tenancy-ports';
import type {
  WorkspaceContext,
  WorkspaceMemberRecord,
  WorkspaceRole,
} from './tenancy-types';

/**
 * Request/workspace context (UTA-19 step 3).
 *
 * Rule: never trust a client-supplied workspace id for authorization.
 * Callers authenticate the user (opaque `userId` from the session), then
 * resolve membership server-side via `store.findByWorkspaceAndUser`.
 * A requested workspace id is only a lookup key — the membership row is
 * the authority for role/scope/status/authVersion.
 */

/** Resolve the caller's membership; null when not a member (deny). */
export async function resolveWorkspaceContext(
  store: WorkspaceMemberStore,
  input: { requestedWorkspaceId: string; userId: string }
): Promise<WorkspaceContext | null> {
  const workspaceId = requireWorkspaceId(input.requestedWorkspaceId);
  if (!input.userId || input.userId.trim().length === 0) {
    throw new TenancyValidationError('userId must not be empty');
  }
  const member = await store.findByWorkspaceAndUser(
    workspaceId,
    input.userId.trim()
  );
  if (!member) return null;
  return toContext(member);
}

export function toContext(member: WorkspaceMemberRecord): WorkspaceContext {
  return {
    workspaceId: member.workspaceId,
    userId: member.userId,
    role: member.role,
    warehouseScope: member.warehouseScope,
    status: member.status,
    authVersion: member.authVersion,
  };
}

/**
 * Deny-by-default: only an `active` member whose resolved `workspaceId`
 * equals the target may proceed. Throws `TenancyForbiddenError` otherwise
 * (indistinguishable from not-found so callers leak nothing).
 */
export function assertSameWorkspace(
  ctx: WorkspaceContext | null,
  targetWorkspaceId: string
): asserts ctx is WorkspaceContext {
  const target = (targetWorkspaceId ?? '').trim();
  if (!ctx || ctx.status !== 'active' || ctx.workspaceId !== target) {
    throw new TenancyForbiddenError();
  }
}

/** Role gate: deny-by-default, Admin bypasses lower-role requirements. */
export function assertRole(
  ctx: WorkspaceContext,
  allowed: readonly WorkspaceRole[]
): void {
  if (ctx.status !== 'active') throw new TenancyForbiddenError();
  if (ctx.role === 'admin') return;
  if (!allowed.includes(ctx.role)) {
    throw new TenancyForbiddenError(
      `Role ${ctx.role} may not perform this action`
    );
  }
}

/** Convenience: Admin or Manager only. */
export function assertManagerOrAdmin(ctx: WorkspaceContext): void {
  assertRole(ctx, ['admin', 'manager']);
}

/**
 * Warehouse gate: Admin (unscoped) passes everywhere; Manager/Staff with a
 * scope may only touch their warehouse; unscoped Manager/Staff may touch
 * any warehouse. Deny-by-default.
 */
export function assertWarehouseAccess(
  ctx: WorkspaceContext,
  warehouseId: string | null | undefined
): void {
  if (ctx.status !== 'active') throw new TenancyForbiddenError();
  if (ctx.role === 'admin') return;
  if (ctx.warehouseScope === null) return;
  if (!warehouseId || warehouseId !== ctx.warehouseScope) {
    throw new TenancyForbiddenError('Warehouse scope denied');
  }
}

/** Validate a scope assignment for a role (Admin must stay unscoped). */
export function checkedScope(
  role: WorkspaceRole,
  scope: string | null | undefined
): string | null {
  return requireWarehouseScope(role, scope);
}
