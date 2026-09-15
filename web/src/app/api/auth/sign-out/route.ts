import { InvalidSessionError, signOut } from '@tokoboss/application';
import {
  buildClearedSessionCookie,
  extractToken,
  getAuthDeps,
} from '@/lib/auth';
import { authJson, routeContext } from '@/lib/auth-routes';

/**
 * Sign out this device (UTA-67).
 * POST /api/auth/sign-out
 *
 * Revokes the session carried by `Authorization: Bearer …` or the
 * `tb_session` cookie and clears the cookie. Idempotent: an unknown or
 * already-revoked token still returns 200 (no session oracle).
 */
export async function POST(request: Request) {
  const { requestId, correlationId, log } = routeContext(request);
  const token = extractToken(request);
  if (!token) {
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
    await signOut(getAuthDeps(), token);
    log.info('sign-out', { route: '/api/auth/sign-out' });
    return authJson(
      { ok: true },
      200,
      requestId,
      correlationId,
      buildClearedSessionCookie()
    );
  } catch {
    log.warn('sign-out failed', {
      route: '/api/auth/sign-out',
      errorCode: 'AUTH_SIGN_OUT_FAILED',
    });
    return authJson(
      { error: 'Sign-out failed.', errorCode: 'AUTH_SIGN_OUT_FAILED' },
      500,
      requestId,
      correlationId
    );
  }
}
