import type {
  FileUploadPatch,
  FileUploadRecord,
  NewFileUploadInput,
} from './upload-types';

/** Thrown when purpose/type/size/role/workspace validation fails pre-token. */
export class UploadValidationError extends Error {
  readonly code = 'UPLOAD_VALIDATION';
  constructor(message: string) {
    super(`UPLOAD_VALIDATION: ${message}`);
    this.name = 'UploadValidationError';
  }
}

export class UploadNotFoundError extends Error {
  readonly code = 'UPLOAD_NOT_FOUND';
  constructor(readonly uploadId: string) {
    super(`Upload ${uploadId} not found`);
    this.name = 'UploadNotFoundError';
  }
}

/** Cross-workspace read/write attempt — denied, never leaked. */
export class UploadForbiddenError extends Error {
  readonly code = 'UPLOAD_FORBIDDEN';
  constructor(message = 'Cross-workspace access denied') {
    super(message);
    this.name = 'UploadForbiddenError';
  }
}

export class UploadConflictError extends Error {
  readonly code = 'UPLOAD_CONFLICT';
  constructor(
    readonly workspaceId: string,
    readonly idempotencyKey: string
  ) {
    super(
      `Upload already exists for workspace ${workspaceId} with idempotency key ${idempotencyKey}`
    );
    this.name = 'UploadConflictError';
  }
}

/**
 * Persistence port for `file_uploads` metadata. Implementations:
 * - `DrizzleFileUploadStore` (`@tokoboss/database`) — Postgres/Neon.
 * - `InMemoryUploadStore` (here) — tests and local fallback.
 *
 * Every read is workspace-scoped so one workspace can never observe another
 * workspace's files. Only metadata is stored — never Blob contents.
 */
export interface FileUploadStore {
  create(input: NewFileUploadInput): Promise<FileUploadRecord>;
  findById(id: string, workspaceId: string): Promise<FileUploadRecord | null>;
  findByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string
  ): Promise<FileUploadRecord | null>;
  findByPathname(
    workspaceId: string,
    pathname: string
  ): Promise<FileUploadRecord | null>;
  update(
    id: string,
    workspaceId: string,
    patch: FileUploadPatch
  ): Promise<FileUploadRecord>;
  listByWorkspace(
    workspaceId: string,
    limit?: number
  ): Promise<FileUploadRecord[]>;
}

/** Audit sink for upload lifecycle events (token/completion/read/delete). */
export interface UploadAuditSink {
  append(input: {
    workspaceId: string;
    action: string;
    payload: Record<string, unknown>;
  }): Promise<void>;
}
