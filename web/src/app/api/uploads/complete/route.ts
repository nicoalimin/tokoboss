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
  UploadNotFoundError,
  UploadValidationError,
  completeUpload,
} from '@tokoboss/application';
import {
  blobKind,
  getUploadAudit,
  getUploadStore,
  storageKind,
} from '@/lib/uploads';

const WORKSPACE_HEADER = 'x-workspace-id';

/**
 * Upload-completion callback (UTA-15 step 4).
 * POST /api/uploads/complete
 *
 * Idempotent finalize of metadata: duplicate completions resolve to the one
 * finalized record (`duplicate: true`, no second row, no state change).
 * Tenancy comes from the required `x-workspace-id` header.
 *
 * Body: `{ uploadId?, idempotencyKey?, pathname, url?, byteSize, checksum?,
 * contentType? }`. Only metadata references are stored — never Blob
 * contents, never secrets.
 */
export async function POST(request: Request) {
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
  if (!workspaceId) {
    return json(
      { error: 'missing x-workspace-id', errorCode: 'UPLOAD_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  let body: {
    uploadId?: unknown;
    idempotencyKey?: unknown;
    pathname?: unknown;
    url?: unknown;
    byteSize?: unknown;
    checksum?: unknown;
    contentType?: unknown;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  try {
    const result = await completeUpload(
      getUploadStore(),
      {
        workspaceId,
        uploadId: typeof body.uploadId === 'string' ? body.uploadId : undefined,
        idempotencyKey:
          typeof body.idempotencyKey === 'string'
            ? body.idempotencyKey
            : undefined,
        pathname: typeof body.pathname === 'string' ? body.pathname : '',
        url: typeof body.url === 'string' ? body.url : undefined,
        byteSize: body.byteSize as number,
        checksum: typeof body.checksum === 'string' ? body.checksum : undefined,
        contentType:
          typeof body.contentType === 'string' ? body.contentType : undefined,
      },
      getUploadAudit()
    );
    log.info('upload completed', {
      uploadId: result.upload.id,
      route: '/api/uploads/complete',
      duplicate: result.duplicate,
    });
    return json(
      {
        upload: result.upload,
        duplicate: result.duplicate,
        storage: storageKind(),
        blob: blobKind(),
      },
      200,
      requestId,
      correlationId
    );
  } catch (err) {
    if (err instanceof UploadValidationError) {
      return json(
        { error: err.message, errorCode: err.code },
        400,
        requestId,
        correlationId
      );
    }
    if (err instanceof UploadNotFoundError) {
      return json(
        { error: err.message, errorCode: err.code },
        404,
        requestId,
        correlationId
      );
    }
    log.warn('upload completion failed', {
      route: '/api/uploads/complete',
      errorCode: 'UPLOAD_COMPLETE_FAILED',
    });
    return json(
      { error: 'completion failed', errorCode: 'UPLOAD_COMPLETE_FAILED' },
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
