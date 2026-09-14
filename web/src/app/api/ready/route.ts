import { NextResponse } from 'next/server';
import { getDeploymentMetadata, validateEnv } from '@tokoboss/config';
import { buildReadinessResponse } from '@tokoboss/observability';
import {
  CORRELATION_HEADER_REQUEST_ID,
  newCorrelationContext,
} from '@tokoboss/observability';

/**
 * GET /api/ready — readiness probe.
 *
 * Reports whether the instance can serve traffic (env validation status +
 * deployment check) using status strings only. Never echoes env values,
 * tenant data, or infrastructure secrets.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const incomingRequestId = request.headers.get(CORRELATION_HEADER_REQUEST_ID);
  const ctx = newCorrelationContext(
    incomingRequestId ? { requestId: incomingRequestId } : {}
  );
  const meta = getDeploymentMetadata();
  const validation = validateEnv();
  const payload = buildReadinessResponse({
    service: 'tokoboss-web',
    environment: meta.environment,
    envValid: validation.success,
    requestId: ctx.requestId,
  });
  const response = NextResponse.json(payload, {
    status: payload.ready ? 200 : 503,
  });
  response.headers.set(CORRELATION_HEADER_REQUEST_ID, ctx.requestId);
  return response;
}
