import { NextResponse } from 'next/server';
import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  contextFromHeaders,
  createLogger,
  newCorrelationId,
  newRequestId,
  resolveDeploymentId,
} from '@tokoboss/observability';
import {
  UploadForbiddenError,
  UploadValidationError,
  authorizeDownload,
  deleteUpload,
} from '@tokoboss/application';
import {
  blobKind,
  getStoragePort,
  getUploadAudit,
  getUploadStore,
  storageKind,
} from '@/lib/uploads';

const WORKSPACE_HEADER = 'x-workspace-id';

function missingWorkspace(requestId: string, correlationId: string) {
  return json(
    { error: 'missing x-workspace-id', errorCode: 'UPLOAD_VALIDATION' },
    400,
    requestId,
    correlationId
  );
}

/**
 * Private reads/downloads (UTA-15 step 5).
 * GET /api/uploads/[id] — authorized through the application; denies
 * cross-workspace. Tenancy comes from the required `x-workspace-id` header.
 * A missing file and a foreign-workspace file are indistinguishable (404)
 * so callers learn nothing about other workspaces' files.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const inbound = contextFromHeaders(
    Object.fromEntries(new Headers(request.headers).entries())
  );
  const requestId = inbound.requestId ?? newRequestId();
  const correlationId = inbound.correlationId ?? newCorrelationId();
  const deploymentId = resolveDeploymentId() ?? undefined;
  const log = createLogger({
    service: 'web',
    baseContext: { requestId, correlationId, deploymentId },
  });

  const workspaceId = request.headers.get(WORKSPACE_HEADER)?.trim();
  if (!workspaceId) return missingWorkspace(requestId, correlationId);
  const { id } = await params;

  try {
    const result = await authorizeDownload(
      getUploadStore(),
      getStoragePort(),
      { workspaceId, uploadId: id },
      getUploadAudit()
    );
    log.info('upload read', { uploadId: id, route: '/api/uploads/[id]' });
    return json(
      {
        upload: result.upload,
        downloadUrl: result.downloadUrl,
        expiresAt: result.expiresAt.toISOString(),
        storage: storageKind(),
        blob: blobKind(),
      },
      200,
      requestId,
      correlationId
    );
  } catch (err) {
    if (err instanceof UploadForbiddenError) {
      return json(
        { error: 'not found', errorCode: 'UPLOAD_NOT_FOUND' },
        404,
        requestId,
        correlationId
      );
    }
    if (err instanceof UploadValidationError) {
      return json(
        { error: err.message, errorCode: err.code },
        409,
        requestId,
        correlationId
      );
    }
    log.warn('upload read failed', {
      route: '/api/uploads/[id]',
      errorCode: 'UPLOAD_READ_FAILED',
    });
    return json(
      { error: 'read failed', errorCode: 'UPLOAD_READ_FAILED' },
      500,
      requestId,
      correlationId
    );
  }
}

/**
 * Deletion interface + audit (UTA-15 step 6).
 * DELETE /api/uploads/[id] — workspace-scoped tombstone (`deleted`) plus
 * private-object deletion. Product-specific retention policies are out of
 * scope; the interface and audit trail are the deliverable.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const inbound = contextFromHeaders(
    Object.fromEntries(new Headers(request.headers).entries())
  );
  const requestId = inbound.requestId ?? newRequestId();
  const correlationId = inbound.correlationId ?? newCorrelationId();
  const deploymentId = resolveDeploymentId() ?? undefined;
  const log = createLogger({
    service: 'web',
    baseContext: { requestId, correlationId, deploymentId },
  });

  const workspaceId = request.headers.get(WORKSPACE_HEADER)?.trim();
  if (!workspaceId) return missingWorkspace(requestId, correlationId);
  const { id } = await params;

  try {
    const upload = await deleteUpload(
      getUploadStore(),
      getStoragePort(),
      { workspaceId, uploadId: id },
      getUploadAudit()
    );
    log.info('upload deleted', { uploadId: id, route: '/api/uploads/[id]' });
    return json(
      { upload, storage: storageKind(), blob: blobKind() },
      200,
      requestId,
      correlationId
    );
  } catch (err) {
    if (err instanceof UploadForbiddenError) {
      return json(
        { error: 'not found', errorCode: 'UPLOAD_NOT_FOUND' },
        404,
        requestId,
        correlationId
      );
    }
    log.warn('upload delete failed', {
      route: '/api/uploads/[id]',
      errorCode: 'UPLOAD_DELETE_FAILED',
    });
    return json(
      { error: 'delete failed', errorCode: 'UPLOAD_DELETE_FAILED' },
      500,
      requestId,
      correlationId
    );
  }
}

function json(
  body: unknown,
  status: number,
  requestId: string,
  correlationId: string
) {
  const res = NextResponse.json(body, { status });
  res.headers.set(REQUEST_ID_HEADER, requestId);
  res.headers.set(CORRELATION_ID_HEADER, correlationId);
  return res;
}
