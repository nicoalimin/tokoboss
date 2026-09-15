import { and, eq } from 'drizzle-orm';
import type { DatabaseHandle, Transaction } from '../db';
import { auditEvents, workspaceMembers } from '../schema/index';
import type {
  NewWorkspaceMemberRow,
  WorkspaceMemberRow,
} from '../schema/index';
import type {
  TenancyAuditSink,
  WorkspaceMemberRecord,
  WorkspaceMemberStore,
} from '@tokoboss/application';
import { isWorkspaceRole } from '@tokoboss/application';

type DbOrTx = Transaction | DatabaseHandle;

function toRecord(row: WorkspaceMemberRow): WorkspaceMemberRecord {
  const role = row.role as WorkspaceMemberRecord['role'];
  if (!isWorkspaceRole(role)) {
    throw new Error(`WORKSPACE_MEMBER_CORRUPT: unknown role ${row.role}`);
  }
  const status =
    row.status === 'active' || row.status === 'deactivated'
      ? row.status
      : (() => {
          throw new Error(
            `WORKSPACE_MEMBER_CORRUPT: unknown status ${row.status}`
          );
        })();
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    userId: row.userId,
    role,
    warehouseScope: row.warehouseScope,
    status,
    authVersion: row.authVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const top = (err as { code?: unknown }).code;
  if (top === '23505') return true;
  const cause = (err as { cause?: unknown }).cause;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    (cause as { code?: unknown }).code === '23505'
  );
}

/**
 * Postgres-backed `WorkspaceMemberStore` (Neon via `createDb`, PGlite in
 * tests). Every read is workspace-scoped; `listByUser` is the only
 * cross-workspace lookup and exists solely to build the server-side
 * session's workspace list.
 */
export class DrizzleWorkspaceMemberStore implements WorkspaceMemberStore {
  constructor(private readonly db: DbOrTx) {}

  withTransaction(tx: DbOrTx): DrizzleWorkspaceMemberStore {
    return new DrizzleWorkspaceMemberStore(tx);
  }

  async create(input: {
    workspaceId: string;
    userId: string;
    role: WorkspaceMemberRecord['role'];
    warehouseScope: string | null;
    status: 'active' | 'deactivated';
  }): Promise<WorkspaceMemberRecord> {
    const row: NewWorkspaceMemberRow = {
      workspaceId: input.workspaceId,
      userId: input.userId,
      role: input.role,
      warehouseScope: input.warehouseScope,
      status: input.status,
    };
    try {
      const inserted = await this.db
        .insert(workspaceMembers)
        .values(row)
        .returning();
      const created = inserted[0];
      if (!created) throw new Error('Failed to insert workspace member');
      return toRecord(created);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new Error(
          `MEMBERSHIP_CONFLICT: ${input.workspaceId} ${input.userId}`
        );
      }
      throw err;
    }
  }

  async findByWorkspaceAndUser(
    workspaceId: string,
    userId: string
  ): Promise<WorkspaceMemberRecord | null> {
    const rows = await this.db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, userId)
        )
      )
      .limit(1);
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async listByWorkspace(workspaceId: string): Promise<WorkspaceMemberRecord[]> {
    const rows = await this.db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId));
    return rows.map(toRecord);
  }

  async listByUser(userId: string): Promise<WorkspaceMemberRecord[]> {
    const rows = await this.db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId));
    return rows.map(toRecord);
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
    const updated = await this.db
      .update(workspaceMembers)
      .set({ ...patch })
      .where(
        and(
          eq(workspaceMembers.id, id),
          eq(workspaceMembers.workspaceId, workspaceId)
        )
      )
      .returning();
    const row = updated[0];
    if (!row) throw new Error(`MEMBERSHIP_NOT_FOUND: ${id}`);
    return toRecord(row);
  }

  async remove(id: string, workspaceId: string): Promise<void> {
    await this.db
      .delete(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.id, id),
          eq(workspaceMembers.workspaceId, workspaceId)
        )
      );
  }
}

/**
 * Postgres-backed `TenancyAuditSink`. Persists membership/workspace/
 * security events with opaque ids only — callers must pass
 * `assertTenancyPayloadSafe`-clean payloads (enforced at the use-case
 * boundary before this sink is reached).
 */
export class DrizzleTenancyAuditSink implements TenancyAuditSink {
  constructor(private readonly db: DbOrTx) {}

  withTransaction(tx: DbOrTx): DrizzleTenancyAuditSink {
    return new DrizzleTenancyAuditSink(tx);
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
    await this.db.insert(auditEvents).values({
      tenantId: input.workspaceId,
      action: input.action,
      payload: input.payload,
      actorType: input.actorType ?? null,
      actorId: input.actorId ?? null,
      category: input.category,
      correlationId: input.correlationId ?? null,
    });
  }
}
