import type {
  TenancyAuditSink,
  WorkspaceMemberStore,
  WorkspaceStore,
} from './tenancy-ports';
import {
  LastAdminError,
  TenancyValidationError,
} from './tenancy-errors';
import {
  assertTenancyPayloadSafe,
  requireRole,
  requireStatus,
  requireUserId,
  requireWarehouseScope,
  requireWorkspaceId,
} from './tenancy-safety';
import { assertSameWorkspace } from './workspace-context';
import type {
  SecurityEventAction,
  WorkspaceContext,
  WorkspaceMemberRecord,
  WorkspaceRole,
} from './tenancy-types';

function auditPayload(
  payload: Record<string, unknown>,
  label: string
): Record<string, unknown> {
  assertTenancyPayloadSafe(payload, label);
  return payload;
}

function countActiveAdmins(
  members: WorkspaceMemberRecord[],
  excludeUserId?: string
): number {
  return members.filter(
    (m) =>
      m.role === 'admin' &&
      m.status === 'active' &&
      m.userId !== (excludeUserId ?? '')
  ).length;
}

/** True when dropping this member would leave zero active Admins. */
export function wouldBreakLastAdminInvariant(
  members: WorkspaceMemberRecord[],
  targetUserId: string
): boolean {
  const target = members.find((m) => m.userId === targetUserId);
  if (!target || target.role !== 'admin' || target.status !== 'active') {
    return false;
  }
  return countActiveAdmins(members, targetUserId) === 0;
}

export interface CreateWorkspaceInput {
  name: string;
  slug: string;
  initialAdminUserId: string;
  actorType?: string;
  actorId?: string;
  correlationId?: string;
}

/**
 * Create a workspace (tenant) with its first active Admin, atomically
 * audited. Later WS1 tickets reuse this for sign-up / onboarding.
 */
export async function createWorkspace(
  workspaces: WorkspaceStore,
  members: WorkspaceMemberStore,
  input: CreateWorkspaceInput,
  audit?: TenancyAuditSink
): Promise<{ workspaceId: string; admin: WorkspaceMemberRecord }> {
  const name = (input.name ?? '').trim();
  const slug = (input.slug ?? '').trim();
  if (name.length === 0) throw new TenancyValidationError('name must not be empty');
  if (slug.length === 0) throw new TenancyValidationError('slug must not be empty');
  const adminUserId = requireUserId(input.initialAdminUserId);
  const ws = await workspaces.createWorkspace({ name, slug });
  const admin = await members.create({
    workspaceId: ws.id,
    userId: adminUserId,
    role: 'admin',
    warehouseScope: null,
    status: 'active',
  });
  if (audit) {
    await audit.append({
      workspaceId: ws.id,
      action: 'workspace.created',
      category: 'workspace',
      actorType: input.actorType ?? 'user',
      actorId: input.actorId ?? adminUserId,
      correlationId: input.correlationId,
      payload: auditPayload(
        { workspaceId: ws.id, slug, adminUserId },
        'workspace.created'
      ),
    });
  }
  return { workspaceId: ws.id, admin };
}

export interface UpdateWorkspaceInput {
  ctx: WorkspaceContext;
  workspaceId: string;
  name?: string;
  slug?: string;
  actorType?: string;
  correlationId?: string;
}

/** Rename a workspace. Admin-only; cross-workspace denied. */
export async function updateWorkspace(
  workspaces: WorkspaceStore,
  input: UpdateWorkspaceInput,
  audit?: TenancyAuditSink
): Promise<{ id: string; name: string; slug: string }> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  if (input.ctx.role !== 'admin') {
    const { TenancyForbiddenError } = await import('./tenancy-errors');
    throw new TenancyForbiddenError('Only Admin may update the workspace');
  }
  const patch: { name?: string; slug?: string } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length === 0) throw new TenancyValidationError('name must not be empty');
    patch.name = name;
  }
  if (input.slug !== undefined) {
    const slug = input.slug.trim();
    if (slug.length === 0) throw new TenancyValidationError('slug must not be empty');
    patch.slug = slug;
  }
  const updated = await workspaces.updateWorkspace(input.workspaceId, patch);
  if (audit) {
    await audit.append({
      workspaceId: updated.id,
      action: 'workspace.updated',
      category: 'workspace',
      actorType: input.actorType ?? 'user',
      actorId: input.ctx.userId,
      correlationId: input.correlationId,
      payload: auditPayload(
        { workspaceId: updated.id, name: updated.name },
        'workspace.updated'
      ),
    });
  }
  return updated;
}

export interface AddMemberInput {
  ctx: WorkspaceContext;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  warehouseScope?: string | null;
  actorType?: string;
  correlationId?: string;
}

/** Add a member. Admin-only; cross-workspace denied. */
export async function addMember(
  members: WorkspaceMemberStore,
  input: AddMemberInput,
  audit?: TenancyAuditSink
): Promise<WorkspaceMemberRecord> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  if (input.ctx.role !== 'admin') {
    const { TenancyForbiddenError } = await import('./tenancy-errors');
    throw new TenancyForbiddenError('Only Admin may add members');
  }
  const workspaceId = requireWorkspaceId(input.workspaceId);
  const userId = requireUserId(input.userId);
  const role = requireRole(input.role);
  const scope = requireWarehouseScope(role, input.warehouseScope);
  const created = await members.create({
    workspaceId,
    userId,
    role,
    warehouseScope: scope,
    status: 'active',
  });
  if (audit) {
    await audit.append({
      workspaceId,
      action: 'membership.added',
      category: 'membership',
      actorType: input.actorType ?? 'user',
      actorId: input.ctx.userId,
      correlationId: input.correlationId,
      payload: auditPayload(
        { workspaceId, userId, role, warehouseScope: scope },
        'membership.added'
      ),
    });
  }
  return created;
}

export interface ChangeMemberInput {
  ctx: WorkspaceContext;
  workspaceId: string;
  targetUserId: string;
  role?: WorkspaceRole;
  warehouseScope?: string | null;
  status?: 'active' | 'deactivated';
  actorType?: string;
  correlationId?: string;
}

/**
 * Change role / warehouse scope / status. Admin-only; cross-workspace
 * denied. Every effective change bumps `auth_version` so sessions can be
 * invalidated. Deactivating or demoting the last active Admin is rejected
 * (`LastAdminError`).
 */
export async function changeMember(
  members: WorkspaceMemberStore,
  input: ChangeMemberInput,
  audit?: TenancyAuditSink
): Promise<WorkspaceMemberRecord> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  if (input.ctx.role !== 'admin') {
    const { TenancyForbiddenError } = await import('./tenancy-errors');
    throw new TenancyForbiddenError('Only Admin may change members');
  }
  const workspaceId = requireWorkspaceId(input.workspaceId);
  const targetUserId = requireUserId(input.targetUserId);
  const current = await members.findByWorkspaceAndUser(workspaceId, targetUserId);
  if (!current) {
    const { TenancyForbiddenError } = await import('./tenancy-errors');
    throw new TenancyForbiddenError();
  }
  const nextRole = input.role !== undefined ? requireRole(input.role) : current.role;
  const nextScope =
    input.warehouseScope !== undefined
      ? requireWarehouseScope(nextRole, input.warehouseScope)
      : input.role !== undefined && input.warehouseScope === undefined
        ? requireWarehouseScope(nextRole, current.warehouseScope)
        : current.warehouseScope;
  const nextStatus =
    input.status !== undefined ? requireStatus(input.status) : current.status;

  const changed =
    nextRole !== current.role ||
    (nextScope ?? null) !== (current.warehouseScope ?? null) ||
    nextStatus !== current.status;
  if (!changed) return current;

  // Final-active-Admin invariant: cannot demote/deactivate/remove the last one.
  if (current.role === 'admin' && current.status === 'active') {
    const all = await members.listByWorkspace(workspaceId);
    const demotesOrDeactivates = nextRole !== 'admin' || nextStatus !== 'active';
    if (demotesOrDeactivates && countActiveAdmins(all, targetUserId) === 0) {
      throw new LastAdminError();
    }
  }

  const updated = await members.update(current.id, workspaceId, {
    role: nextRole,
    warehouseScope: nextScope,
    status: nextStatus,
    authVersion: current.authVersion + 1,
  });

  if (audit) {
    const actions: string[] = [];
    if (nextRole !== current.role) actions.push('membership.role_changed');
    if ((nextScope ?? null) !== (current.warehouseScope ?? null)) {
      actions.push('membership.scope_changed');
    }
    if (nextStatus !== current.status) actions.push('membership.status_changed');
    for (const action of actions) {
      await audit.append({
        workspaceId,
        action,
        category: 'membership',
        actorType: input.actorType ?? 'user',
        actorId: input.ctx.userId,
        correlationId: input.correlationId,
        payload: auditPayload(
          {
            workspaceId,
            userId: targetUserId,
            from: {
              role: current.role,
              warehouseScope: current.warehouseScope,
              status: current.status,
            },
            to: { role: nextRole, warehouseScope: nextScope, status: nextStatus },
            authVersion: updated.authVersion,
          },
          action
        ),
      });
    }
  }
  return updated;
}

export interface RemoveMemberInput {
  ctx: WorkspaceContext;
  workspaceId: string;
  targetUserId: string;
  actorType?: string;
  correlationId?: string;
}

/** Hard-remove a member. Admin-only; last active Admin is protected. */
export async function removeMember(
  members: WorkspaceMemberStore,
  input: RemoveMemberInput,
  audit?: TenancyAuditSink
): Promise<void> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  if (input.ctx.role !== 'admin') {
    const { TenancyForbiddenError } = await import('./tenancy-errors');
    throw new TenancyForbiddenError('Only Admin may remove members');
  }
  const workspaceId = requireWorkspaceId(input.workspaceId);
  const targetUserId = requireUserId(input.targetUserId);
  const current = await members.findByWorkspaceAndUser(workspaceId, targetUserId);
  if (!current) {
    const { TenancyForbiddenError } = await import('./tenancy-errors');
    throw new TenancyForbiddenError();
  }
  if (current.role === 'admin' && current.status === 'active') {
    const all = await members.listByWorkspace(workspaceId);
    if (countActiveAdmins(all, targetUserId) === 0) {
      throw new LastAdminError();
    }
  }
  await members.remove(current.id, workspaceId);
  if (audit) {
    await audit.append({
      workspaceId,
      action: 'membership.removed',
      category: 'membership',
      actorType: input.actorType ?? 'user',
      actorId: input.ctx.userId,
      correlationId: input.correlationId,
      payload: auditPayload(
        { workspaceId, userId: targetUserId, role: current.role },
        'membership.removed'
      ),
    });
  }
}

/**
 * Forced sign-out hook (UTA-17 freeze: revoke-all on password reset /
 * Admin deactivate). Bumps the member's `auth_version` so every session
 * minted before the bump fails validation, and emits
 * `security.forced_sign_out` for audit.
 */
export async function forceSignOut(
  members: WorkspaceMemberStore,
  input: {
    ctx: WorkspaceContext;
    workspaceId: string;
    targetUserId: string;
    reason: 'password_reset' | 'admin_deactivate' | 'admin_revoke';
    correlationId?: string;
  },
  audit?: TenancyAuditSink
): Promise<WorkspaceMemberRecord> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  if (input.ctx.role !== 'admin') {
    const { TenancyForbiddenError } = await import('./tenancy-errors');
    throw new TenancyForbiddenError('Only Admin may force sign-out');
  }
  const workspaceId = requireWorkspaceId(input.workspaceId);
  const targetUserId = requireUserId(input.targetUserId);
  const current = await members.findByWorkspaceAndUser(workspaceId, targetUserId);
  if (!current) {
    const { TenancyForbiddenError } = await import('./tenancy-errors');
    throw new TenancyForbiddenError();
  }
  const updated = await members.update(current.id, workspaceId, {
    authVersion: current.authVersion + 1,
  });
  if (audit) {
    await audit.append({
      workspaceId,
      action: 'security.forced_sign_out',
      category: 'security',
      actorType: 'user',
      actorId: input.ctx.userId,
      correlationId: input.correlationId,
      payload: auditPayload(
        {
          workspaceId,
          userId: targetUserId,
          reason: input.reason,
          authVersion: updated.authVersion,
        },
        'security.forced_sign_out'
      ),
    });
  }
  return updated;
}

export interface SecurityEventInput {
  workspaceId?: string;
  action: SecurityEventAction;
  actorId?: string;
  correlationId?: string;
  /** Opaque metadata only — secrets/PII are rejected. */
  payload?: Record<string, unknown>;
}

/**
 * Hooks for the four MVP security events (UTA-17). Sign-in UI lands later;
 * these writers are the durable baseline so those routes emit auditable
 * events from day one. `sign_in_failed` payloads must stay rate-limited
 * and identifier-free at the route layer (no email/phone in the payload).
 */
export async function emitSecurityEvent(
  audit: TenancyAuditSink,
  input: SecurityEventInput
): Promise<void> {
  const payload = auditPayload(input.payload ?? {}, input.action);
  // `security.*` events are workspace-scoped when a workspace is known;
  // pre-auth failures (unknown workspace) use the caller's workspace or
  // fall back to a dedicated sentinel the route provides. UTA-19 requires
  // a workspace id — routes without one must pass their auth tenant.
  const workspaceId = requireWorkspaceId(input.workspaceId);
  await audit.append({
    workspaceId,
    action: input.action,
    category: 'security',
    actorType: 'user',
    actorId: input.actorId,
    correlationId: input.correlationId,
    payload,
  });
}
