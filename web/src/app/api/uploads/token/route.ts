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
  requestUploadToken,
} from '@tokoboss/application';
import {
  blobKind,
  getStoragePort,
  getUploadAudit,
  getUploadStore,
  storageKind,
} from '@/lib/uploads';

const WORKSPACE_HEADER = 'x-workspace-id';
const ROLE_HEADER = 'x-role';

/**
 * Issue a short-lived client-upload token (UTA-15 step 3).
 * POST /api/uploads/token
 *
 * Auth (stub, documented): tenancy comes from the required
 * `x-workspace-id` header; the required `x-role` header must be one of
 * `owner | admin | staff`. An optional `Authorization: Bearer …` token is
 * recorded only as an opaque actor reference (presence is logged, the token
 * value never is). Real session auth is out of scope for Workstream 0.
 *
 * Validates role, workspace, purpose, filename/type, size BEFORE issuing
 * the token. The pathname is always derived server-side — client-supplied
 * paths are never trusted. Returns a short-lived single-use `uploadToken`,
 * never the long-lived `BLOB_READ_WRITE_TOKEN`.
 *
 * Body: `{ purpose, filename, contentType, byteSize, relatedEntityType?,
 * relatedEntityId?, idempotencyKey?, retentionUntil? }`.
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
  const role = request.headers.get(ROLE_HEADER)?.trim();
  if (!role) {
    return json(
      { error: 'missing x-role', errorCode: 'UPLOAD_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }
  const authHeader = request.headers.get('authorization');
  const actor =
    authHeader?.startsWith('Bearer ') && authHeader.length > 7
      ? { actorType: 'bearer-stub', actorId: 'bearer-present' }
      : { actorType: role, actorId: `${role}-stub` };

  let body: {
    purpose?: unknown;
    filename?: unknown;
    contentType?: unknown;
    byteSize?: unknown;
    relatedEntityType?: unknown;
    relatedEntityId?: unknown;
    idempotencyKey?: unknown;
    retentionUntil?: unknown;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  try {
    const result = await requestUploadToken(
      getUploadStore(),
      getStoragePort(),
      {
        workspaceId,
        purpose: body.purpose as string,
        filename: body.filename as string,
        contentType: body.contentType as string,
        byteSize: body.byteSize as number,
        role,
        actorType: actor.actorType,
        actorId: actor.actorId,
        relatedEntityType: body.relatedEntityType as string | undefined,
        relatedEntityId: body.relatedEntityId as string | undefined,
        idempotencyKey: body.idempotencyKey as string | undefined,
        retentionUntil:
          typeof body.retentionUntil === 'string'
            ? new Date(body.retentionUntil)
            : undefined,
      },
      getUploadAudit()
    );
    // Log references only — never the token value or pathname contents
    // verbatim (redact() collapses blob-like keys/values at the sink).
    log.info('upload token issued', {
      uploadId: result.upload.id,
      route: '/api/uploads/token',
      duplicate: result.duplicate,
    });
    return json(
      {
        upload: result.upload,
        uploadToken: result.uploadToken,
        uploadUrl: result.uploadUrl,
        pathname: result.pathname,
        expiresAt: result.expiresAt.toISOString(),
        storage: storageKind(),
        blob: blobKind(),
      },
      result.duplicate ? 200 : 201,
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
    if (err instanceof UploadForbiddenError) {
      return json(
        { error: err.message, errorCode: err.code },
        403,
        requestId,
        correlationId
      );
    }
    log.warn('upload token failed', {
      route: '/api/uploads/token',
      errorCode: 'UPLOAD_TOKEN_FAILED',
    });
    return json(
      { error: 'token issuance failed', errorCode: 'UPLOAD_TOKEN_FAILED' },
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
