import type { FileUploadStore, UploadAuditSink } from './upload-ports';
import { UploadConflictError } from './upload-ports';
import type {
  FileUploadPatch,
  FileUploadRecord,
  NewFileUploadInput,
} from './upload-types';

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

function now(): Date {
  return new Date();
}

/**
 * In-memory `FileUploadStore` for unit tests and the web local fallback
 * (no `DATABASE_URL`). Enforces the same contracts as Postgres:
 * workspace scoping, `(workspace_id, idempotency_key)` uniqueness,
 * idempotent completion, cross-workspace denial.
 */
export class InMemoryUploadStore implements FileUploadStore {
  private uploads = new Map<string, FileUploadRecord>();
  private byKey = new Map<string, string>();
  private byPath = new Map<string, string>();
  private seq = 0;
  readonly auditEvents: Array<{
    workspaceId: string;
    action: string;
    payload: Record<string, unknown>;
  }> = [];

  get audit(): UploadAuditSink {
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

  async create(input: NewFileUploadInput): Promise<FileUploadRecord> {
    const key = `${input.workspaceId}::${input.idempotencyKey}`;
    if (this.byKey.has(key)) {
      throw new UploadConflictError(input.workspaceId, input.idempotencyKey);
    }
    const timestamp = now();
    const record: FileUploadRecord = {
      id: this.nextId('upl'),
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
      status: 'pending',
      retentionUntil: input.retentionUntil ?? null,
      completedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.uploads.set(record.id, record);
    this.byKey.set(key, record.id);
    this.byPath.set(`${input.workspaceId}::${input.pathname}`, record.id);
    return clone(record);
  }

  async findById(id: string, workspaceId: string): Promise<FileUploadRecord | null> {
    const record = this.uploads.get(id);
    if (!record || record.workspaceId !== workspaceId) return null;
    return clone(record);
  }

  async findByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string
  ): Promise<FileUploadRecord | null> {
    const id = this.byKey.get(`${workspaceId}::${idempotencyKey}`);
    if (!id) return null;
    return this.findById(id, workspaceId);
  }

  async findByPathname(
    workspaceId: string,
    pathname: string
  ): Promise<FileUploadRecord | null> {
    const id = this.byPath.get(`${workspaceId}::${pathname}`);
    if (!id) return null;
    return this.findById(id, workspaceId);
  }

  async update(
    id: string,
    workspaceId: string,
    patch: FileUploadPatch
  ): Promise<FileUploadRecord> {
    const record = this.uploads.get(id);
    if (!record || record.workspaceId !== workspaceId) {
      throw new Error(`UPLOAD_NOT_FOUND: ${id}`);
    }
    const updated: FileUploadRecord = {
      ...record,
      ...clone(patch),
      id: record.id,
      workspaceId: record.workspaceId,
      pathname: record.pathname,
      purpose: record.purpose,
      idempotencyKey: record.idempotencyKey,
      createdAt: record.createdAt,
      updatedAt: now(),
    };
    this.uploads.set(id, updated);
    return clone(updated);
  }

  async listByWorkspace(
    workspaceId: string,
    limit = 50
  ): Promise<FileUploadRecord[]> {
    const out: FileUploadRecord[] = [];
    for (const record of this.uploads.values()) {
      if (record.workspaceId !== workspaceId) continue;
      out.push(clone(record));
      if (out.length >= limit) break;
    }
    return out;
  }
}
