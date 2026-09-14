import { NextResponse } from 'next/server';
import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  contextFromHeaders,
  createLogger,
  newCorrelationId,
  newRequestId,
  resolveDeploymentId,
  runSampleJob,
} from '@tokoboss/observability';

/**
 * Sample background execution trigger (UTA-12 evidence).
 * POST /api/jobs/sample reuses the request correlation id for the job so
 * the two log lines correlate end to end. No tenant data accepted.
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
  log.info('sample job requested', { route: '/api/jobs/sample' });

  let task = 'reconcile-sample';
  try {
    const body = (await request.json()) as { task?: unknown };
    if (
      typeof body.task === 'string' &&
      body.task.length > 0 &&
      body.task.length <= 64
    ) {
      task = body.task;
    }
  } catch {
    // Empty/invalid body is fine — defaults apply. Never log raw body.
  }

  const result = await runSampleJob({ correlationId, requestId, task });
  log.info('sample job accepted', { jobId: result.jobId });

  const res = NextResponse.json({
    jobId: result.jobId,
    correlationId: result.correlationId,
    requestId,
    status: result.status,
  });
  res.headers.set(REQUEST_ID_HEADER, requestId);
  res.headers.set(CORRELATION_ID_HEADER, correlationId);
  return res;
}
