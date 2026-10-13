import type { TenancyAuditSink, WorkspaceMemberStore } from './tenancy-ports';
import { assertTenancyPayloadSafe } from './tenancy-safety';
import type { WorkspaceMemberRecord } from './tenancy-types';

/**
 * US29 / RFC 02 row 23 — per-request workspace access (active membership in
 * an active workspace). Every failure returns the same neutral `{ ok: false }`
 * (one 404). `last_active_at` is written only after access passes (60 s
 * throttle; a switch always writes). Denied audit only when a membership row
 * exists; unknown/malformed ids produce a structured log line only.
 */

export type WorkspaceAccessResult =
  { ok: true; membership: WorkspaceMemberRecord } | { ok: false };

export interface AccessWorkspaceDeps {
  members: WorkspaceMemberStore;
  audit: TenancyAuditSink;
  log?: (line: Record<string, unknown>) => void;
}

export interface AccessWorkspaceInput {
  workspaceId: string;
  userId: string;
  sessionId: string;
  switching?: { fromWorkspaceId?: string };
  correlationId?: string;
}

const TOUCH_THROTTLE_MS = 60_000;
const OPAQUE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const DENIED: WorkspaceAccessResult = { ok: false };

export async function accessWorkspace(
  deps: AccessWorkspaceDeps,
  input: AccessWorkspaceInput,
  now = new Date()
): Promise<WorkspaceAccessResult> {
  const workspaceId = (input.workspaceId ?? '').trim();
  const userId = (input.userId ?? '').trim();
  const { sessionId, switching } = input;
  const emit = async (action: string, payload: Record<string, unknown>) => {
    assertTenancyPayloadSafe(payload, action);
    await deps.audit.append({
      workspaceId,
      action,
      category: 'security',
      actorType: 'user',
      actorId: userId,
      correlationId: input.correlationId,
      payload,
    });
  };

  const membership =
    OPAQUE_ID.test(workspaceId) && userId
      ? await deps.members.findByWorkspaceAndUser(workspaceId, userId)
      : null;
  if (!membership) {
    deps.log?.({ event: 'workspace_access.unknown', sessionId });
    return DENIED;
  }

  const denied = 'security.workspace_access_denied';
  if (membership.status !== 'active') {
    await emit(denied, { sessionId, reason: 'membership_deactivated' });
    return DENIED;
  }
  const accessible = await deps.members.listAccessibleByUser(userId);
  const row = accessible.find((m) => m.workspaceId === workspaceId);
  if (!row) {
    await emit(denied, { sessionId, reason: 'workspace_deactivated' });
    return DENIED;
  }

  const last = row.lastActiveAt?.getTime();
  const stale = last == null || now.getTime() - last >= TOUCH_THROTTLE_MS;
  if (switching || stale) {
    await deps.members.touchLastActive(workspaceId, userId, now);
  }
  if (switching) {
    const from = switching.fromWorkspaceId;
    await emit('security.workspace_switched', {
      ...(from ? { fromWorkspaceId: from } : {}),
      toWorkspaceId: workspaceId,
      sessionId,
    });
  }
  return { ok: true, membership: row };
}
