import type {
  FileUploadPatch,
  FileUploadRecord,
  FileUploadStore,
  NewFileUploadInput,
} from '@tokoboss/application';
import { UploadConflictError, isFileUploadStatus } from '@tokoboss/application';
import { isFileUploadPurpose } from '@tokoboss/domain';
import { and, asc, eq } from 'drizzle-orm';
import type { DatabaseHandle, Transaction } from '../db';
import { fileUploads } from '../schema/index';
import type { FileUploadRow } from '../schema/index';

type DbOrTx = Transaction | DatabaseHandle;

function toRecord(row: FileUploadRow): FileUploadRecord {
  if (!isFileUploadPurpose(row.purpose)) {
    throw new Error(`UPLOAD_CORRUPT: unknown purpose ${row.purpose}`);
  }
  if (!isFileUploadStatus(row.status)) {
    throw new Error(`UPLOAD_CORRUPT: unknown status ${row.status}`);
  }
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    purpose: row.purpose,
    relatedEntityType: row.relatedEntityType,
    relatedEntityId: row.relatedEntityId,
    pathname: row.pathname,
    url: row.url,
    contentType: row.contentType,
    byteSize: row.byteSize,
    checksum: row.checksum,
    idempotencyKey: row.idempotencyKey,
    createdByType: row.createdByType,
    createdById: row.createdById,
    status: row.status,
    retentionUntil: row.retentionUntil,
    completedAt: row.completedAt,
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
 * Postgres-backed `FileUploadStore` (Neon via `createDb`, PGlite in tests).
 * Stores metadata only — never Blob contents, never secrets.
 */
export class DrizzleFileUploadStore implements FileUploadStore {
  constructor(private readonly db: DbOrTx) {}

  withTransaction(tx: DbOrTx): DrizzleFileUploadStore {
    return new DrizzleFileUploadStore(tx);
  }

  async create(input: NewFileUploadInput): Promise<FileUploadRecord> {
    try {
      const inserted = await this.db
        .insert(fileUploads)
        .values({
          workspaceId: input.workspaceId,
          purpose: input.purpose,
          relatedEntityType: input.relatedEntityType ?? null,
          relatedEntityId: input.relatedEntityId ?? null,
          pathname: input.pathname,
          url: input.url ?? null,
          contentType: input.contentType,
          byteSize: input.byteSize,
          checksum: input.checksum ?? null,
          idempotencyKey: input.idempotencyKey,
          createdByType: input.createdByType ?? null,
          createdById: input.createdById ?? null,
          retentionUntil: input.retentionUntil ?? null,
        })
        .returning();
      const created = inserted[0];
      if (!created) throw new Error('Failed to insert file upload');
      return toRecord(created);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new UploadConflictError(input.workspaceId, input.idempotencyKey);
      }
      throw err;
    }
  }

  async findById(
    id: string,
    workspaceId: string
  ): Promise<FileUploadRecord | null> {
    const rows = await this.db
      .select()
      .from(fileUploads)
      .where(
        and(eq(fileUploads.id, id), eq(fileUploads.workspaceId, workspaceId))
      )
      .limit(1);
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async findByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string
  ): Promise<FileUploadRecord | null> {
    const rows = await this.db
      .select()
      .from(fileUploads)
      .where(
        and(
          eq(fileUploads.workspaceId, workspaceId),
          eq(fileUploads.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1);
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async findByPathname(
    workspaceId: string,
    pathname: string
  ): Promise<FileUploadRecord | null> {
    const rows = await this.db
      .select()
      .from(fileUploads)
      .where(
        and(
          eq(fileUploads.workspaceId, workspaceId),
          eq(fileUploads.pathname, pathname)
        )
      )
      .limit(1);
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async update(
    id: string,
    workspaceId: string,
    patch: FileUploadPatch
  ): Promise<FileUploadRecord> {
    const updated = await this.db
      .update(fileUploads)
      .set({ ...patch })
      .where(
        and(eq(fileUploads.id, id), eq(fileUploads.workspaceId, workspaceId))
      )
      .returning();
    const row = updated[0];
    if (!row) throw new Error(`UPLOAD_NOT_FOUND: ${id}`);
    return toRecord(row);
  }

  async listByWorkspace(
    workspaceId: string,
    limit = 50
  ): Promise<FileUploadRecord[]> {
    const rows = await this.db
      .select()
      .from(fileUploads)
      .where(eq(fileUploads.workspaceId, workspaceId))
      .orderBy(asc(fileUploads.createdAt))
      .limit(limit);
    return rows.map(toRecord);
  }
}
