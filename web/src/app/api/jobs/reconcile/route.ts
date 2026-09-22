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
import { reconcileStrandedJobs } from '@tokoboss/application';
import { getJobExecutor, getJobStore, storageKind } from '@/lib/jobs';

/**
 * Transactional-outbox reconciler entrypoint (UTA-14, cron-ready).
 * POST /api/jobs/reconcile
 *
 * Dispatches stranded work: committed-but-never-dispatched `queued` jobs
 * and `waiting` jobs whose backoff has elapsed. Execution is idempotent, so
 * running this on a schedule (or by hand after a failed deploy) is safe.
 *
 * Auth (stub, documented): when `CRON_SECRET` is set, the request must
 * carry a matching `x-cron-secret` header (Vercel cron convention).
 * Without it (local dev), the call is scoped to one workspace via the
 * required `x-workspace-id` header.
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

  const cronSecret = process.env['CRON_SECRET'];
  let workspaceId: string | undefined;
  if (cronSecret) {
    if (request.headers.get('x-cron-secret') !== cronSecret) {
      return json(
        { error: 'unauthorized', errorCode: 'JOB_UNAUTHORIZED' },
        401,
        requestId,
        correlationId
      );
    }
  } else {
    workspaceId = request.headers.get('x-workspace-id')?.trim() || undefined;
    if (!workspaceId) {
      return json(
        { error: 'missing x-workspace-id', errorCode: 'JOB_VALIDATION' },
        400,
        requestId,
        correlationId
      );
    }
  }

  const result = await reconcileStrandedJobs(getJobStore(), getJobExecutor(), {
    workspaceId,
  });
  log.info('jobs reconciled', {
    route: '/api/jobs/reconcile',
    examined: result.examined,
    dispatched: result.dispatched.length,
  });
  return json(
    { ...result, storage: storageKind() },
    200,
    requestId,
    correlationId
  );
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
