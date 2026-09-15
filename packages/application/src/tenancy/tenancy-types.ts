/**
 * Workspace tenancy vocabulary (UTA-19).
 *
 * UTA-17 product freeze honored here:
 * - RBAC: Admin / Manager / Staff only (lowercase `admin|manager|staff`).
 * - Manager/Staff may carry an optional warehouse scope (opaque id);
 *   Admin must be unscoped (null).
 * - Server-side deny-by-default; auth-version bump on role/scope/status
 *   change; final-active-Admin invariant.
 */

export const WORKSPACE_ROLES = ['admin', 'manager', 'staff'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const WORKSPACE_MEMBER_STATUSES = ['active', 'deactivated'] as const;
export type WorkspaceMemberStatus = (typeof WORKSPACE_MEMBER_STATUSES)[number];

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return (
    typeof value === 'string' &&
    (WORKSPACE_ROLES as readonly string[]).includes(value)
  );
}

export function isWorkspaceMemberStatus(
  value: unknown
): value is WorkspaceMemberStatus {
  return (
    typeof value === 'string' &&
    (WORKSPACE_MEMBER_STATUSES as readonly string[]).includes(value)
  );
}

export interface WorkspaceMemberRecord {
  id: string;
  workspaceId: string;
  /** Opaque auth-provider user id. Never email/name. */
  userId: string;
  role: WorkspaceRole;
  /** Opaque warehouse id or null (all warehouses). */
  warehouseScope: string | null;
  status: WorkspaceMemberStatus;
  /** Bumps on every role/scope/status change (session invalidation). */
  authVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewWorkspaceMemberInput {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  warehouseScope?: string | null;
  status?: WorkspaceMemberStatus;
}

export interface WorkspaceMemberPatch {
  role?: WorkspaceRole;
  warehouseScope?: string | null;
  status?: WorkspaceMemberStatus;
}

/**
 * Server-resolved request context. Built ONLY from a trusted membership
 * lookup (database) keyed by the authenticated user id — never from a
 * client-supplied workspace id or role claim.
 */
export interface WorkspaceContext {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  warehouseScope: string | null;
  status: WorkspaceMemberStatus;
  authVersion: number;
}

export interface TenancyAuditEvent {
  workspaceId: string;
  action: string;
  category: 'membership' | 'workspace' | 'security';
  actorType?: string;
  actorId?: string;
  correlationId?: string;
  payload: Record<string, unknown>;
}

/**
 * MVP security events (UTA-17 freeze). Hooks exist here so later sign-in /
 * password-reset / forced-sign-out work emits them; the sign-in UI itself
 * is out of scope for UTA-19.
 */
export const SECURITY_EVENT_ACTIONS = [
  'security.sign_in_succeeded',
  'security.sign_in_failed',
  'security.password_reset',
  'security.forced_sign_out',
] as const;
export type SecurityEventAction = (typeof SECURITY_EVENT_ACTIONS)[number];

export const MEMBERSHIP_EVENT_ACTIONS = [
  'workspace.created',
  'workspace.updated',
  'membership.added',
  'membership.role_changed',
  'membership.scope_changed',
  'membership.status_changed',
  'membership.removed',
] as const;
export type MembershipEventAction = (typeof MEMBERSHIP_EVENT_ACTIONS)[number];
