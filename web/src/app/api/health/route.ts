import { NextResponse } from 'next/server';
import { getDeploymentMetadata } from '@tokoboss/config';
import { buildHealthResponse } from '@tokoboss/observability';
import {
  CORRELATION_HEADER_REQUEST_ID,
  newCorrelationContext,
} from '@tokoboss/observability';

const STARTED_AT = Date.now();

/**
 * GET /api/health — liveness probe.
 *
 * Returns only safe fields (status, service, environment, version, uptime).
 * Never tenant data, never secrets. Suitable for load-balancer checks.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const incomingRequestId = request.headers.get(CORRELATION_HEADER_REQUEST_ID);
  const ctx = newCorrelationContext(
    incomingRequestId ? { requestId: incomingRequestId } : {}
  );
  const meta = getDeploymentMetadata();
  const payload = buildHealthResponse({
    service: 'tokoboss-web',
    environment: meta.environment,
    version: meta.commitSha?.slice(0, 12) ?? '0.0.0',
    uptimeSeconds: (Date.now() - STARTED_AT) / 1000,
    requestId: ctx.requestId,
  });
  const response = NextResponse.json(payload);
  response.headers.set(CORRELATION_HEADER_REQUEST_ID, ctx.requestId);
  return response;
}
