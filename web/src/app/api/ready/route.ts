import { NextResponse } from 'next/server';
import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  contextFromHeaders,
  newCorrelationId,
  newRequestId,
  resolveDeploymentId,
  createLogger,
} from '@tokoboss/observability';
import { validateEnv } from '@tokoboss/config';

/**
 * Readiness: reports whether the server can serve traffic.
 * Only exposes pass/fail per check — never env values, tenant data,
 * connection strings, or secrets.
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

  const validation = validateEnv();
  const envCheck = validation.success ? 'pass' : 'fail';
  const ready = validation.success;
  if (!ready) {
    log.warn('readiness not ready', {
      errorCode: 'ENV_INVALID',
      route: '/api/ready',
    });
  } else {
    log.info('readiness check', { route: '/api/ready' });
  }

  const res = NextResponse.json(
    {
      status: ready ? 'ready' : 'not-ready',
      service: 'web',
      checks: { env: envCheck },
      timestamp: new Date().toISOString(),
      deploymentId: deploymentId ?? null,
      requestId,
      correlationId,
    },
    { status: ready ? 200 : 503 }
  );
  res.headers.set(REQUEST_ID_HEADER, requestId);
  res.headers.set(CORRELATION_ID_HEADER, correlationId);
  return res;
}
