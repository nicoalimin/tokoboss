import {
  getMemberStore,
  requireSessionToken,
  slideSessionCookie,
  storageKind,
} from '@/lib/auth';
import { authJson, routeContext } from '@/lib/auth-routes';

/**
 * Read the caller's own workspace membership (UTA-74).
 * GET /api/auth/membership
 *
 * Requires a valid session (Bearer or cookie). Returns the client-safe
 * membership projection for the session workspace — opaque ids, role,
 * warehouse scope, and status. Any signed-in member may read their own row
 * (including Manager/Staff); the Admin-only management APIs stay gated by
 * `requireWorkspaceAdmin`. Missing/invalid sessions are 401; a session
 * without a live membership is a generic 403. Validating slides the server
 * idle clock; cookie web sessions also get a refreshed `Set-Cookie`.
 */
export async function GET(request: Request) {
  const { requestId, correlationId, log } = routeContext(request);
  const validated = await requireSessionToken(request);
  if (!validated) {
    return authJson(
      {
        error: 'Session is expired. Sign in again.',
        errorCode: 'INVALID_SESSION',
      },
      401,
      requestId,
      correlationId
    );
  }
  const member = await getMemberStore().findByWorkspaceAndUser(
    validated.workspaceId,
    validated.userId
  );
  if (!member || member.status !== 'active') {
    return authJson(
      {
        error: 'Cross-workspace access denied',
        errorCode: 'TENANCY_FORBIDDEN',
      },
      403,
      requestId,
      correlationId
    );
  }
  log.info('membership read', { route: '/api/auth/membership' });
  return authJson(
    {
      membership: {
        workspaceId: member.workspaceId,
        userId: member.userId,
        role: member.role,
        warehouseScope: member.warehouseScope,
        status: member.status,
      },
      storage: storageKind(),
    },
    200,
    requestId,
    correlationId,
    slideSessionCookie(validated)
  );
}
