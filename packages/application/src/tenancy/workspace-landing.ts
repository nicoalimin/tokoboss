import type { WorkspaceMemberStore, WorkspaceStore } from './tenancy-ports';
import { TenancyValidationError } from './tenancy-errors';
import type { WorkspaceRole } from './tenancy-types';

/**
 * US29 / RFC 02 row 14 — post-sign-in landing + accessible workspace list.
 *
 * Landing via `listAccessibleByUser` (active∩active, highest lastActiveAt first):
 * zero → picker; one → that workspace; many with top.lastActiveAt → open top;
 * many all-null lastActiveAt → picker. Pending invites join at the route layer.
 */

export type WorkspaceLandingResult =
  { kind: 'workspace'; workspaceId: string } | { kind: 'picker' };

export interface AccessibleWorkspaceItem {
  workspaceId: string;
  name: string;
  initials: string;
  role: WorkspaceRole;
  warehouseScopeLabel: string;
  lastActiveAt: Date | null;
}

function requireUserId(userId: string): string {
  const uid = (userId ?? '').trim();
  if (!uid) throw new TenancyValidationError('userId must not be empty');
  return uid;
}

/** Two-letter initials from the workspace name for picker avatars. */
export function workspaceInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  const a = parts[0]![0] ?? '';
  const b = parts[parts.length - 1]![0] ?? '';
  return (a + b).toUpperCase();
}

/** Unscoped → Semua gudang; otherwise the opaque warehouse id. */
export function warehouseScopeLabel(scope: string | null): string {
  if (scope == null || scope.trim() === '') return 'Semua gudang';
  return scope.trim();
}

/** Where the client should go after account sign-in (no workspaceId). */
export async function resolveWorkspaceLanding(
  members: WorkspaceMemberStore,
  userId: string
): Promise<WorkspaceLandingResult> {
  const uid = requireUserId(userId);
  const accessible = await members.listAccessibleByUser(uid);
  if (accessible.length === 0) return { kind: 'picker' };
  if (accessible.length === 1) {
    return { kind: 'workspace', workspaceId: accessible[0]!.workspaceId };
  }
  const top = accessible[0]!;
  if (top.lastActiveAt != null) {
    return { kind: 'workspace', workspaceId: top.workspaceId };
  }
  return { kind: 'picker' };
}

/** Picker/switcher rows; ordered most-recent lastActiveAt first. */
export async function listAccessibleWorkspaces(
  members: WorkspaceMemberStore,
  workspaces: WorkspaceStore,
  userId: string
): Promise<AccessibleWorkspaceItem[]> {
  const uid = requireUserId(userId);
  const rows = await members.listAccessibleByUser(uid);
  const out: AccessibleWorkspaceItem[] = [];
  for (const row of rows) {
    const ws = await workspaces.findWorkspaceById(row.workspaceId);
    if (!ws) continue;
    out.push({
      workspaceId: row.workspaceId,
      name: ws.name,
      initials: workspaceInitials(ws.name),
      role: row.role,
      warehouseScopeLabel: warehouseScopeLabel(row.warehouseScope),
      lastActiveAt: row.lastActiveAt,
    });
  }
  return out;
}
