import { NextResponse } from 'next/server';
import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  contextFromHeaders,
  createLogger,
  newCorrelationId,
  newRequestId,
  resolveDeploymentId,
  type TokobossLogger,
} from '@tokoboss/observability';

/** Per-request observability context (ids echoed on every response). */
export function routeContext(request: Request): {
  requestId: string;
  correlationId: string;
  log: TokobossLogger;
} {
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
  return { requestId, correlationId, log };
}

export function authJson(
  body: unknown,
  status: number,
  requestId: string,
  correlationId: string,
  setCookie?: string
): NextResponse {
  const res = NextResponse.json(body, { status });
  res.headers.set(REQUEST_ID_HEADER, requestId);
  res.headers.set(CORRELATION_ID_HEADER, correlationId);
  if (setCookie) res.headers.set('Set-Cookie', setCookie);
  return res;
}
