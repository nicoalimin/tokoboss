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
import { JobNotFoundError, readJobTimeline } from '@tokoboss/application';
import { getJobStore, storageKind } from '@/lib/jobs';

const WORKSPACE_HEADER = 'x-workspace-id';

/**
 * Read API (UTA-14 acceptance: "UI/API can read current progress and
 * ordered events from Postgres").
 * GET /api/jobs/[id] — workspace-scoped via `x-workspace-id`.
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
  if (!workspaceId) {
    return json(
      { error: 'missing x-workspace-id', errorCode: 'JOB_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }
  const { id } = await params;

  try {
    const timeline = await readJobTimeline(getJobStore(), {
      jobId: id,
      workspaceId,
    });
    log.info('job read', { jobId: id, route: '/api/jobs/[id]' });
    return json(
      { job: timeline.job, events: timeline.events, storage: storageKind() },
      200,
      requestId,
      correlationId
    );
  } catch (err) {
    if (err instanceof JobNotFoundError) {
      return json(
        { error: err.message, errorCode: err.code },
        404,
        requestId,
        correlationId
      );
    }
    return json(
      { error: 'read failed', errorCode: 'JOB_READ_FAILED' },
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
