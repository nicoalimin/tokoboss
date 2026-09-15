import { InvalidSessionError, listSessions } from '@tokoboss/application';
import {
  getAuthDeps,
  requireSessionToken,
  slideSessionCookie,
} from '@/lib/auth';
import { authJson, routeContext } from '@/lib/auth-routes';

/**
 * List active sessions for the authenticated user (UTA-67).
 * GET /api/auth/sessions
 *
 * Returns non-revoked, idle-fresh sessions (newest first) as client-safe
 * projections — no hashes, no tokens. Requires a valid session (Bearer or
 * cookie); validating slides the server idle clock, and cookie web
 * sessions also get a refreshed `Set-Cookie` so active use never forces
 * an absolute logout at the cookie layer.
 */
export async function GET(request: Request) {
  const { requestId, correlationId } = routeContext(request);
  const validated = await requireSessionToken(request);
  if (!validated) {
    const expired = new InvalidSessionError();
    return authJson(
      {
        error: expired.message,
        errorCode: expired.code,
      },
      401,
      requestId,
      correlationId
    );
  }
  const sessions = await listSessions(getAuthDeps(), validated.userId);
  return authJson(
    { sessions },
    200,
    requestId,
    correlationId,
    slideSessionCookie(validated)
  );
}
