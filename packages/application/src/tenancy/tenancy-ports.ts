import type {
  WorkspaceMemberRecord,
  WorkspaceMemberStatus,
} from './tenancy-types';

/**
 * Persistence port for `workspace_members`. Implementations:
 * - `DrizzleWorkspaceMemberStore` (`@tokoboss/database`) — Postgres/Neon.
 * - `InMemoryTenancyStore` (here) — unit tests.
 *
 * Every read is workspace-scoped so one workspace can never observe
 * another workspace's membership. `findByUser` is the ONLY cross-workspace
 * lookup and exists solely to build the server-side session's workspace
 * list — it must never be driven by a client-supplied workspace id.
 */
export interface WorkspaceMemberStore {
  create(input: {
    workspaceId: string;
    userId: string;
    role: WorkspaceMemberRecord['role'];
    warehouseScope: string | null;
    status: WorkspaceMemberStatus;
  }): Promise<WorkspaceMemberRecord>;
  findByWorkspaceAndUser(
    workspaceId: string,
    userId: string
  ): Promise<WorkspaceMemberRecord | null>;
  listByWorkspace(workspaceId: string): Promise<WorkspaceMemberRecord[]>;
  listByUser(userId: string): Promise<WorkspaceMemberRecord[]>;
  update(
    id: string,
    workspaceId: string,
    patch: {
      role?: WorkspaceMemberRecord['role'];
      warehouseScope?: string | null;
      status?: WorkspaceMemberStatus;
      authVersion?: number;
    }
  ): Promise<WorkspaceMemberRecord>;
  remove(id: string, workspaceId: string): Promise<void>;
}

/** Minimal workspace (tenant) store for create/update use-cases. */
export interface WorkspaceStore {
  createWorkspace(input: { name: string; slug: string }): Promise<{
    id: string;
    name: string;
    slug: string;
  }>;
  updateWorkspace(
    id: string,
    patch: { name?: string; slug?: string }
  ): Promise<{ id: string; name: string; slug: string }>;
  findWorkspaceById(
    id: string
  ): Promise<{ id: string; name: string; slug: string } | null>;
}

/** Audit sink for membership/workspace/security events. */
export interface TenancyAuditSink {
  append(input: {
    workspaceId: string;
    action: string;
    category: 'membership' | 'workspace' | 'security';
    actorType?: string;
    actorId?: string;
    correlationId?: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
}

/**
 * Minimal session-revocation port so membership changes (deactivate,
 * forced sign-out) can revoke server-side session rows. Deliberately
 * narrow — `@tokoboss/application`'s auth `SessionStore` satisfies it
 * structurally, and tenancy never imports the auth module (no cycle).
 */
export interface SessionRevoker {
  revokeAllByUser(userId: string, revokedAt: Date): Promise<number>;
}
