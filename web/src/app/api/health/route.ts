import { NextResponse } from 'next/server';
import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  contextFromHeaders,
  newCorrelationId,
  newRequestId,
  resolveDeploymentId,
} from '@tokoboss/observability';
import { createLogger } from '@tokoboss/observability';

/**
 * Liveness: cheap, unauthenticated, no tenant data, no secrets.
 * Echoes correlation ids so callers can match the line in stdout logs.
 */
export async function GET(request: Request) {
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
  log.info('health check', { route: '/api/health' });

  const res = NextResponse.json({
    status: 'ok',
    service: 'web',
    env:
      process.env.APP_ENV ??
      process.env.VERCEL_ENV ??
      process.env.NODE_ENV ??
      'local',
    timestamp: new Date().toISOString(),
    deploymentId: deploymentId ?? null,
    requestId,
    correlationId,
  });
  res.headers.set(REQUEST_ID_HEADER, requestId);
  res.headers.set(CORRELATION_ID_HEADER, correlationId);
  return res;
}
