import type {
  NewWorkspaceInviteInput,
  WorkspaceInviteRecord,
} from './invite-types';
import { isWorkspaceRole } from './tenancy-types';
import type { WorkspaceInviteStore } from './invite-ports';
import { isWorkspaceInviteStatus } from './invite-types';

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

function checked(record: WorkspaceInviteRecord): WorkspaceInviteRecord {
  if (!isWorkspaceRole(record.role)) {
    throw new Error(`WORKSPACE_INVITE_CORRUPT: unknown role ${record.role}`);
  }
  if (!isWorkspaceInviteStatus(record.status)) {
    throw new Error(
      `WORKSPACE_INVITE_CORRUPT: unknown status ${record.status}`
    );
  }
  return record;
}

/**
 * In-memory invite store for unit tests. Mirrors the Postgres contracts:
 * token-hash uniqueness, workspace scoping, pending-email lookup bound to
 * `now` (expired tickets are invisible to the duplicate check, exactly
 * like the Drizzle implementation's `expires_at > now` filter).
 */
export class InMemoryInviteStore implements WorkspaceInviteStore {
  private readonly byId = new Map<string, WorkspaceInviteRecord>();
  private readonly byToken = new Map<string, string>();
  private seq = 0;

  async create(input: NewWorkspaceInviteInput): Promise<WorkspaceInviteRecord> {
    if (this.byToken.has(input.tokenHash)) {
      throw new Error(`INVITE_CONFLICT: token collision`);
    }
    const now = new Date();
    this.seq += 1;
    const record: WorkspaceInviteRecord = {
      id: `inv_${String(this.seq).padStart(4, '0')}`,
      workspaceId: input.workspaceId,
      email: input.email,
      role: input.role,
      warehouseScope: input.warehouseScope ?? null,
      tokenHash: input.tokenHash,
      status: 'pending',
      expiresAt: new Date(input.expiresAt),
      invitedBy: input.invitedBy ?? null,
      acceptedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(record.id, record);
    this.byToken.set(record.tokenHash, record.id);
    return clone(checked(record));
  }

  async findByTokenHash(
    tokenHash: string
  ): Promise<WorkspaceInviteRecord | null> {
    const id = this.byToken.get(tokenHash);
    const row = id ? this.byId.get(id) : undefined;
    return row ? clone(checked(row)) : null;
  }

  async findById(
    id: string,
    workspaceId: string
  ): Promise<WorkspaceInviteRecord | null> {
    const row = this.byId.get(id);
    if (!row || row.workspaceId !== workspaceId) return null;
    return clone(checked(row));
  }

  async listByWorkspace(workspaceId: string): Promise<WorkspaceInviteRecord[]> {
    const out: WorkspaceInviteRecord[] = [];
    for (const row of this.byId.values()) {
      if (row.workspaceId === workspaceId) out.push(clone(checked(row)));
    }
    return out;
  }

  async findPendingByWorkspaceAndEmail(
    workspaceId: string,
    normalizedEmail: string,
    now: Date
  ): Promise<WorkspaceInviteRecord | null> {
    for (const row of this.byId.values()) {
      if (
        row.workspaceId === workspaceId &&
        row.email === normalizedEmail &&
        row.status === 'pending' &&
        row.expiresAt.getTime() > now.getTime()
      ) {
        return clone(checked(row));
      }
    }
    return null;
  }

  async update(
    id: string,
    workspaceId: string,
    patch: {
      status?: WorkspaceInviteRecord['status'];
      acceptedAt?: Date | null;
    }
  ): Promise<WorkspaceInviteRecord> {
    const row = this.byId.get(id);
    if (!row || row.workspaceId !== workspaceId) {
      throw new Error(`INVITE_NOT_FOUND: ${id}`);
    }
    if (patch.status !== undefined) {
      if (!isWorkspaceInviteStatus(patch.status)) {
        throw new Error(`INVITE_CORRUPT: unknown status ${patch.status}`);
      }
      row.status = patch.status;
    }
    if (patch.acceptedAt !== undefined) {
      row.acceptedAt = patch.acceptedAt ? new Date(patch.acceptedAt) : null;
    }
    row.updatedAt = new Date();
    return clone(checked(row));
  }
}
