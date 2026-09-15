import type {
  TenancyAuditSink,
  WorkspaceMemberStore,
  WorkspaceStore,
} from './tenancy-ports';
import type {
  WorkspaceContext,
  WorkspaceMemberRecord,
} from './tenancy-types';

function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((v) => clone(v)) as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = clone(v);
    }
    return out as T;
  }
  return value;
}

/**
 * In-memory tenancy stores for unit tests. Enforce the same contracts as
 * Postgres: `(workspace_id, user_id)` uniqueness, workspace scoping,
 * cross-workspace denial by returning null (use-cases map it to
 * `TenancyForbiddenError`).
 */
export class InMemoryTenancyStore
  implements WorkspaceMemberStore, WorkspaceStore, TenancyAuditSink
{
  private workspaces = new Map<string, { id: string; name: string; slug: string }>();
  private members = new Map<string, WorkspaceMemberRecord>();
  private byWorkspaceUser = new Map<string, string>();
  private seq = 0;
  private wsSeq = 0;
  readonly auditEvents: Array<{
    workspaceId: string;
    action: string;
    category: 'membership' | 'workspace' | 'security';
    actorType?: string;
    actorId?: string;
    correlationId?: string;
    payload: Record<string, unknown>;
  }> = [];

  get audit(): TenancyAuditSink {
    return {
      append: async (input) => {
        this.auditEvents.push(clone(input));
      },
    };
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq.toString().padStart(4, '0')}`;
  }

  // WorkspaceStore

  async createWorkspace(input: {
    name: string;
    slug: string;
  }): Promise<{ id: string; name: string; slug: string }> {
    this.wsSeq += 1;
    const ws = {
      id: `ws_${this.wsSeq.toString().padStart(4, '0')}`,
      name: input.name,
      slug: input.slug,
    };
    this.workspaces.set(ws.id, ws);
    return clone(ws);
  }

  async updateWorkspace(
    id: string,
    patch: { name?: string; slug?: string }
  ): Promise<{ id: string; name: string; slug: string }> {
    const ws = this.workspaces.get(id);
    if (!ws) throw new Error(`WORKSPACE_NOT_FOUND: ${id}`);
    const updated = { ...ws, ...patch };
    this.workspaces.set(id, updated);
    return clone(updated);
  }

  async findWorkspaceById(
    id: string
  ): Promise<{ id: string; name: string; slug: string } | null> {
    const ws = this.workspaces.get(id);
    return ws ? clone(ws) : null;
  }

  // WorkspaceMemberStore

  async create(input: {
    workspaceId: string;
    userId: string;
    role: WorkspaceMemberRecord['role'];
    warehouseScope: string | null;
    status: 'active' | 'deactivated';
  }): Promise<WorkspaceMemberRecord> {
    const key = `${input.workspaceId}::${input.userId}`;
    if (this.byWorkspaceUser.has(key)) {
      throw new Error(
        `MEMBERSHIP_CONFLICT: ${input.workspaceId} ${input.userId}`
      );
    }
    const now = new Date();
    const record: WorkspaceMemberRecord = {
      id: this.nextId('mbr'),
      workspaceId: input.workspaceId,
      userId: input.userId,
      role: input.role,
      warehouseScope: input.warehouseScope,
      status: input.status,
      authVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.members.set(record.id, record);
    this.byWorkspaceUser.set(key, record.id);
    return clone(record);
  }

  async findByWorkspaceAndUser(
    workspaceId: string,
    userId: string
  ): Promise<WorkspaceMemberRecord | null> {
    const id = this.byWorkspaceUser.get(`${workspaceId}::${userId}`);
    if (!id) return null;
    const record = this.members.get(id);
    return record ? clone(record) : null;
  }

  async listByWorkspace(workspaceId: string): Promise<WorkspaceMemberRecord[]> {
    const out: WorkspaceMemberRecord[] = [];
    for (const m of this.members.values()) {
      if (m.workspaceId === workspaceId) out.push(clone(m));
    }
    return out;
  }

  async listByUser(userId: string): Promise<WorkspaceMemberRecord[]> {
    const out: WorkspaceMemberRecord[] = [];
    for (const m of this.members.values()) {
      if (m.userId === userId) out.push(clone(m));
    }
    return out;
  }

  async update(
    id: string,
    workspaceId: string,
    patch: {
      role?: WorkspaceMemberRecord['role'];
      warehouseScope?: string | null;
      status?: 'active' | 'deactivated';
      authVersion?: number;
    }
  ): Promise<WorkspaceMemberRecord> {
    const record = this.members.get(id);
    if (!record || record.workspaceId !== workspaceId) {
      throw new Error(`MEMBERSHIP_NOT_FOUND: ${id}`);
    }
    const updated: WorkspaceMemberRecord = {
      ...record,
      ...(patch.role !== undefined ? { role: patch.role } : {}),
      ...(patch.warehouseScope !== undefined
        ? { warehouseScope: patch.warehouseScope }
        : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.authVersion !== undefined
        ? { authVersion: patch.authVersion }
        : {}),
      id: record.id,
      workspaceId: record.workspaceId,
      userId: record.userId,
      createdAt: record.createdAt,
      updatedAt: new Date(),
    };
    this.members.set(id, updated);
    return clone(updated);
  }

  async remove(id: string, workspaceId: string): Promise<void> {
    const record = this.members.get(id);
    if (!record || record.workspaceId !== workspaceId) {
      throw new Error(`MEMBERSHIP_NOT_FOUND: ${id}`);
    }
    this.members.delete(id);
    this.byWorkspaceUser.delete(`${workspaceId}::${record.userId}`);
  }

  async append(input: {
    workspaceId: string;
    action: string;
    category: 'membership' | 'workspace' | 'security';
    actorType?: string;
    actorId?: string;
    correlationId?: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    this.auditEvents.push(clone(input));
  }
}

/** Build an Admin `WorkspaceContext` for tests without a DB lookup. */
export function adminContext(
  workspaceId: string,
  userId: string
): WorkspaceContext {
  return {
    workspaceId,
    userId,
    role: 'admin',
    warehouseScope: null,
    status: 'active',
    authVersion: 1,
  };
}
