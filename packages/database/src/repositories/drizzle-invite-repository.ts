import { and, eq, gt } from 'drizzle-orm';
import type { DatabaseHandle, Transaction } from '../db';
import { workspaceInvites } from '../schema/index';
import type { WorkspaceInviteRow } from '../schema/index';
import type {
  NewWorkspaceInviteInput,
  WorkspaceInviteRecord,
  WorkspaceInviteStore,
} from '@tokoboss/application';
import { isWorkspaceRole } from '@tokoboss/application';
import { isWorkspaceInviteStatus } from '@tokoboss/application';

type DbOrTx = Transaction | DatabaseHandle;

function toRecord(row: WorkspaceInviteRow): WorkspaceInviteRecord {
  const role = row.role as WorkspaceInviteRecord['role'];
  if (!isWorkspaceRole(role)) {
    throw new Error(`WORKSPACE_INVITE_CORRUPT: unknown role ${row.role}`);
  }
  const status = row.status as WorkspaceInviteRecord['status'];
  if (!isWorkspaceInviteStatus(status)) {
    throw new Error(`WORKSPACE_INVITE_CORRUPT: unknown status ${row.status}`);
  }
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    email: row.email,
    role,
    warehouseScope: row.warehouseScope,
    tokenHash: row.tokenHash,
    status,
    expiresAt: row.expiresAt,
    invitedBy: row.invitedBy,
    acceptedAt: row.acceptedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  if ((err as { code?: unknown }).code === '23505') return true;
  const cause = (err as { cause?: unknown }).cause;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    (cause as { code?: unknown }).code === '23505'
  );
}

/**
 * Postgres-backed `WorkspaceInviteStore` (Neon via `createDb`, PGlite in
 * tests). Stores token *hashes* only; the invitee email is persisted (PII)
 * so `accept` can bind the ticket to the credential row — use-cases keep
 * it out of audit payloads and logs.
 */
export class DrizzleInviteStore implements WorkspaceInviteStore {
  constructor(private readonly db: DbOrTx) {}

  withTransaction(tx: DbOrTx): DrizzleInviteStore {
    return new DrizzleInviteStore(tx);
  }

  async create(input: NewWorkspaceInviteInput): Promise<WorkspaceInviteRecord> {
    try {
      const inserted = await this.db
        .insert(workspaceInvites)
        .values({
          workspaceId: input.workspaceId,
          email: input.email,
          role: input.role,
          warehouseScope: input.warehouseScope ?? null,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          invitedBy: input.invitedBy ?? null,
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error('Failed to insert workspace invite');
      return toRecord(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw new Error('INVITE_CONFLICT');
      throw err;
    }
  }

  async findByTokenHash(
    tokenHash: string
  ): Promise<WorkspaceInviteRecord | null> {
    const rows = await this.db
      .select()
      .from(workspaceInvites)
      .where(eq(workspaceInvites.tokenHash, tokenHash))
      .limit(1);
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async findById(
    id: string,
    workspaceId: string
  ): Promise<WorkspaceInviteRecord | null> {
    const rows = await this.db
      .select()
      .from(workspaceInvites)
      .where(
        and(
          eq(workspaceInvites.id, id),
          eq(workspaceInvites.workspaceId, workspaceId)
        )
      )
      .limit(1);
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async listByWorkspace(workspaceId: string): Promise<WorkspaceInviteRecord[]> {
    const rows = await this.db
      .select()
      .from(workspaceInvites)
      .where(eq(workspaceInvites.workspaceId, workspaceId));
    return rows.map(toRecord);
  }

  async findPendingByWorkspaceAndEmail(
    workspaceId: string,
    normalizedEmail: string,
    now: Date
  ): Promise<WorkspaceInviteRecord | null> {
    const rows = await this.db
      .select()
      .from(workspaceInvites)
      .where(
        and(
          eq(workspaceInvites.workspaceId, workspaceId),
          eq(workspaceInvites.email, normalizedEmail),
          eq(workspaceInvites.status, 'pending'),
          gt(workspaceInvites.expiresAt, now)
        )
      )
      .limit(1);
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async update(
    id: string,
    workspaceId: string,
    patch: {
      status?: WorkspaceInviteRecord['status'];
      acceptedAt?: Date | null;
    }
  ): Promise<WorkspaceInviteRecord> {
    const updated = await this.db
      .update(workspaceInvites)
      .set({ ...patch })
      .where(
        and(
          eq(workspaceInvites.id, id),
          eq(workspaceInvites.workspaceId, workspaceId)
        )
      )
      .returning();
    const row = updated[0];
    if (!row) throw new Error(`INVITE_NOT_FOUND: ${id}`);
    return toRecord(row);
  }
}
