import { NextResponse, type NextRequest } from 'next/server';
import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  newCorrelationId,
  newRequestId,
} from '@tokoboss/observability';
import { legacyRedirectTarget } from '@/lib/legacy-redirect';

/**
 * Correlation headers + US29 / RFC 02 row 60 legacy redirects (308).
 * Membership stays in `/w/` layout.
 */
export function middleware(request: NextRequest) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? newRequestId();
  const correlationId =
    request.headers.get(CORRELATION_ID_HEADER) ?? newCorrelationId();

  const target = legacyRedirectTarget(
    request.nextUrl.pathname,
    request.nextUrl.searchParams
  );
  if (target) {
    const res = NextResponse.redirect(new URL(target, request.url), 308);
    res.headers.set(REQUEST_ID_HEADER, requestId);
    res.headers.set(CORRELATION_ID_HEADER, correlationId);
    return res;
  }

  const res = NextResponse.next();
  res.headers.set(REQUEST_ID_HEADER, requestId);
  res.headers.set(CORRELATION_ID_HEADER, correlationId);
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
