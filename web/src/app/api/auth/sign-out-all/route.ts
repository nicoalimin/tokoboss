import { InvalidSessionError, signOutAll } from '@tokoboss/application';
import {
  buildClearedSessionCookie,
  getAuthDeps,
  requireSessionToken,
} from '@/lib/auth';
import { authJson, routeContext } from '@/lib/auth-routes';

/**
 * Sign out all devices (UTA-67).
 * POST /api/auth/sign-out-all
 *
 * Revokes every session for the authenticated user and emits
 * `security.forced_sign_out`. Requires a valid session (Bearer or cookie).
 */
export async function POST(request: Request) {
  const { requestId, correlationId, log } = routeContext(request);
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
  try {
    const { revokedCount } = await signOutAll(getAuthDeps(), {
      userId: validated.userId,
      workspaceId: validated.workspaceId,
      actorId: validated.userId,
      correlationId,
    });
    log.info('sign-out-all', {
      route: '/api/auth/sign-out-all',
      revokedCount,
    });
    return authJson(
      { ok: true, revokedCount },
      200,
      requestId,
      correlationId,
      buildClearedSessionCookie()
    );
  } catch {
    log.warn('sign-out-all failed', {
      route: '/api/auth/sign-out-all',
      errorCode: 'AUTH_SIGN_OUT_ALL_FAILED',
    });
    return authJson(
      { error: 'Sign-out failed.', errorCode: 'AUTH_SIGN_OUT_ALL_FAILED' },
      500,
      requestId,
      correlationId
    );
  }
}
