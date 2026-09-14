import { NextResponse, type NextRequest } from 'next/server';
import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  newCorrelationId,
  newRequestId,
} from '@tokoboss/observability';

/**
 * Propagate correlation vocabulary on every response.
 * Generates `x-request-id` when absent; preserves caller `x-correlation-id`
 * so web -> job -> integration traces stay joined.
 */
export function middleware(request: NextRequest) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  const correlationId =
    request.headers.get(CORRELATION_ID_HEADER) ?? newCorrelationId();
  const res = NextResponse.next();
  res.headers.set(REQUEST_ID_HEADER, requestId);
  res.headers.set(CORRELATION_ID_HEADER, correlationId);
  return res;
}

export const config = {
  matcher: ['/api/:path*'],
};
