import type { ObjectStoragePort } from '@tokoboss/domain';
import { isFileUploadPurpose } from '@tokoboss/domain';
import {
  UploadConflictError,
  UploadForbiddenError,
  UploadNotFoundError,
  UploadValidationError,
  type FileUploadStore,
  type UploadAuditSink,
} from './upload-ports';
import {
  assertUploadMetadataSafe,
  sanitizeFilename,
  validateTokenRequest,
} from './upload-safety';
import {
  PURPOSE_MAX_BYTES,
  PURPOSE_MIME_ALLOWLIST,
  isFileUploadStatus,
  isUploadAllowedRole,
  type FileUploadPurpose,
  type FileUploadRecord,
} from './upload-types';

function requireWorkspace(value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new UploadValidationError('workspaceId must not be empty');
  }
  return value.trim();
}

export interface RequestUploadTokenInput {
  workspaceId: string;
  purpose: string;
  filename: string;
  contentType: string;
  byteSize: number;
  role: string;
  actorType?: string;
  actorId?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  idempotencyKey?: string;
  retentionUntil?: Date;
}

export interface RequestUploadTokenResult {
  upload: FileUploadRecord;
  uploadToken: string;
  uploadUrl: string;
  pathname: string;
  expiresAt: Date;
  duplicate: boolean;
}

/**
 * Authenticated token issuance (UTA-15 step 3).
 *
 * Validates role, workspace, purpose, filename/type, size BEFORE issuing a
 * short-lived client-upload token. Never exposes Blob write tokens
 * long-lived; never trusts client-supplied workspace/path — the pathname is
 * always derived server-side as
 * `workspaces/{workspaceId}/{purpose}/{idempotencyKey}/{sanitizedFilename}`.
 */
export async function requestUploadToken(
  store: FileUploadStore,
  storage: ObjectStoragePort,
  input: RequestUploadTokenInput,
  audit?: UploadAuditSink
): Promise<RequestUploadTokenResult> {
  const workspaceId = requireWorkspace(input.workspaceId);
  if (!isUploadAllowedRole(input.role)) {
    throw new UploadForbiddenError(
      `Role ${JSON.stringify(input.role)} may not request uploads`
    );
  }
  validateTokenRequest({
    workspaceId,
    purpose: input.purpose,
    filename: input.filename,
    contentType: input.contentType,
    byteSize: input.byteSize,
    role: input.role,
  });
  assertUploadMetadataSafe(
    {
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
    },
    'related_entity'
  );

  const purpose = input.purpose as FileUploadPurpose;
  const idempotencyKey =
    input.idempotencyKey && input.idempotencyKey.trim().length > 0
      ? input.idempotencyKey.trim()
      : `upl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  // Idempotent token request: same (workspace, key) resolves to the same
  // pending record instead of minting a second pathname.
  const existing = await store.findByIdempotencyKey(workspaceId, idempotencyKey);
  if (existing) {
    const token = await storage.issueUploadToken({
      workspaceId,
      purpose,
      pathname: existing.pathname,
      contentType: existing.contentType,
      byteSize: existing.byteSize,
    });
    return {
      upload: existing,
      uploadToken: token.uploadToken,
      uploadUrl: token.uploadUrl,
      pathname: existing.pathname,
      expiresAt: token.expiresAt,
      duplicate: true,
    };
  }

  const pathname = [
    'workspaces',
    workspaceId,
    purpose,
    idempotencyKey,
    sanitizeFilename(input.filename),
  ].join('/');

  let upload: FileUploadRecord;
  try {
    upload = await store.create({
      workspaceId,
      purpose,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
      pathname,
      contentType: input.contentType,
      byteSize: input.byteSize,
      idempotencyKey,
      createdByType: input.actorType ?? input.role,
      createdById: input.actorId,
      retentionUntil: input.retentionUntil,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'UploadConflictError') {
      const winner = await store.findByIdempotencyKey(workspaceId, idempotencyKey);
      if (winner) {
        const token = await storage.issueUploadToken({
          workspaceId,
          purpose,
          pathname: winner.pathname,
          contentType: winner.contentType,
          byteSize: winner.byteSize,
        });
        return {
          upload: winner,
          uploadToken: token.uploadToken,
          uploadUrl: token.uploadUrl,
          pathname: winner.pathname,
          expiresAt: token.expiresAt,
          duplicate: true,
        };
      }
      throw err as UploadConflictError;
    }
    throw err;
  }

  const token = await storage.issueUploadToken({
    workspaceId,
    purpose,
    pathname,
    contentType: input.contentType,
    byteSize: input.byteSize,
  });

  if (audit) {
    await audit.append({
      workspaceId,
      action: 'file_upload.token_issued',
      payload: { uploadId: upload.id, purpose, byteSize: input.byteSize },
    });
  }
  return {
    upload,
    uploadToken: token.uploadToken,
    uploadUrl: token.uploadUrl,
    pathname,
    expiresAt: token.expiresAt,
    duplicate: false,
  };
}

export interface CompleteUploadInput {
  workspaceId: string;
  uploadId?: string;
  idempotencyKey?: string;
  pathname: string;
  url?: string;
  byteSize: number;
  checksum?: string;
  contentType?: string;
}

/**
 * Idempotent finalize of metadata (UTA-15 step 4): duplicate completion
 * callbacks resolve to the single finalized record — exactly one
 * `completed` row per `(workspace_id, idempotency_key)`.
 */
export async function completeUpload(
  store: FileUploadStore,
  input: CompleteUploadInput,
  audit?: UploadAuditSink
): Promise<{ upload: FileUploadRecord; duplicate: boolean }> {
  const workspaceId = requireWorkspace(input.workspaceId);
  if (!input.pathname || input.pathname.trim().length === 0) {
    throw new UploadValidationError('pathname must not be empty');
  }
  assertUploadMetadataSafe(
    { url: input.url, checksum: input.checksum },
    'completion'
  );

  let record: FileUploadRecord | null = null;
  if (input.uploadId) {
    record = await store.findById(input.uploadId, workspaceId);
  } else if (input.idempotencyKey) {
    record = await store.findByIdempotencyKey(workspaceId, input.idempotencyKey);
  }
  if (!record) {
    // Pathname fallback keeps retried client callbacks idempotent even when
    // the caller lost the upload id.
    record = await store.findByPathname(workspaceId, input.pathname.trim());
  }
  if (!record) throw new UploadNotFoundError(input.uploadId ?? input.pathname);

  if (record.status === 'completed') {
    return { upload: record, duplicate: true };
  }
  if (record.status === 'deleted') {
    throw new UploadValidationError('Cannot complete a deleted upload');
  }
  if (record.pathname !== input.pathname.trim()) {
    throw new UploadValidationError('pathname does not match the issued token');
  }
  if (input.contentType !== undefined && input.contentType !== record.contentType) {
    throw new UploadValidationError('contentType does not match the issued token');
  }
  const maxBytes = PURPOSE_MAX_BYTES[record.purpose];
  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0) {
    throw new UploadValidationError('byteSize must be a positive number');
  }
  if (input.byteSize > maxBytes) {
    throw new UploadValidationError(
      `byteSize ${input.byteSize} exceeds ${maxBytes} for purpose ${record.purpose}`
    );
  }

  const updated = await store.update(record.id, workspaceId, {
    status: 'completed',
    url: input.url ?? record.url,
    checksum: input.checksum ?? record.checksum,
    byteSize: input.byteSize,
    completedAt: new Date(),
  });
  if (audit) {
    await audit.append({
      workspaceId,
      action: 'file_upload.completed',
      payload: { uploadId: updated.id, purpose: updated.purpose },
    });
  }
  return { upload: updated, duplicate: false };
}

export interface AuthorizeReadInput {
  workspaceId: string;
  uploadId: string;
}

/**
 * Private reads (UTA-15 step 5): authorize through the application; deny
 * cross-workspace. Reads resolve the workspace-scoped record and mint a
 * short-lived download grant — the raw pathname/URL is never trusted from
 * the client alone.
 */
export async function authorizeDownload(
  store: FileUploadStore,
  storage: ObjectStoragePort,
  input: AuthorizeReadInput,
  audit?: UploadAuditSink
): Promise<{ upload: FileUploadRecord; downloadUrl: string; expiresAt: Date }> {
  const workspaceId = requireWorkspace(input.workspaceId);
  const upload = await store.findById(input.uploadId, workspaceId);
  if (!upload) {
    // Deliberately indistinguishable from forbidden: callers learn nothing
    // about other workspaces' files.
    throw new UploadForbiddenError();
  }
  if (upload.status !== 'completed') {
    throw new UploadValidationError(
      `Upload ${upload.id} is not readable (status ${upload.status})`
    );
  }
  const grant = await storage.createDownloadGrant(upload.pathname, workspaceId);
  if (audit) {
    await audit.append({
      workspaceId,
      action: 'file_upload.read',
      payload: { uploadId: upload.id },
    });
  }
  return { upload, downloadUrl: grant.downloadUrl, expiresAt: grant.expiresAt };
}

export interface DeleteUploadInput {
  workspaceId: string;
  uploadId: string;
  actorType?: string;
  actorId?: string;
}

/**
 * Deletion/retention interfaces + audit (UTA-15 step 6). Marks the metadata
 * row `deleted` and deletes the private object. Product-specific retention
 * policies (when to call this) are out of scope — the interface and audit
 * trail are the deliverable.
 */
export async function deleteUpload(
  store: FileUploadStore,
  storage: ObjectStoragePort,
  input: DeleteUploadInput,
  audit?: UploadAuditSink
): Promise<FileUploadRecord> {
  const workspaceId = requireWorkspace(input.workspaceId);
  const upload = await store.findById(input.uploadId, workspaceId);
  if (!upload) throw new UploadForbiddenError();
  if (upload.status === 'deleted') return upload;
  await storage.deleteObject(upload.pathname);
  const updated = await store.update(upload.id, workspaceId, { status: 'deleted' });
  if (audit) {
    await audit.append({
      workspaceId,
      action: 'file_upload.deleted',
      payload: {
        uploadId: updated.id,
        purpose: updated.purpose,
        ...(input.actorId ? { actorId: input.actorId } : {}),
      },
    });
  }
  return updated;
}

/** Re-exported guard for Route Handlers validating query-supplied enums. */
export function assertKnownPurpose(purpose: unknown): asserts purpose is FileUploadPurpose {
  if (!isFileUploadPurpose(purpose)) {
    throw new UploadValidationError(
      `purpose must be one of the operational purposes (got ${JSON.stringify(purpose)})`
    );
  }
}

/** MIME allowlist check exposed for completion-time re-validation. */
export function assertMimeAllowed(purpose: FileUploadPurpose, contentType: string): void {
  if (!PURPOSE_MIME_ALLOWLIST[purpose].includes(contentType)) {
    throw new UploadValidationError(
      `contentType ${JSON.stringify(contentType)} not allowed for purpose ${JSON.stringify(purpose)}`
    );
  }
}

export { isFileUploadStatus };
