import {
  InvalidCredentialsError,
  InvalidSessionError,
  PasswordPolicyError,
  ProfileForbiddenError,
  ProfileValidationError,
  changePassword,
} from '@tokoboss/application';
import { ChangePasswordBodySchema } from '@tokoboss/contracts';
import {
  buildClearedSessionCookie,
  getAuthDeps,
  requireSessionToken,
} from '@/lib/auth';
import { authJson, routeContext } from '@/lib/auth-routes';

/**
 * Change password while authenticated (UTA-72, UTA-17 freeze).
 * POST /api/auth/password/change
 *
 * Body: `{ currentPassword, newPassword }`. Enforces the shared policy
 * (min 8 + denylist), rotates the hash, revokes ALL sessions (including
 * the caller's — the response clears the web cookie), bumps every
 * membership `auth_version`, and emits `security.password_change` +
 * `security.forced_sign_out`. Wrong current password is a generic 401;
 * weak replacements are 400s. Secrets are never logged.
 */
export async function POST(request: Request) {
  const { requestId, correlationId, log } = routeContext(request);
  const validated = await requireSessionToken(request);
  if (!validated) {
    const expired = new InvalidSessionError();
    return authJson(
      { error: expired.message, errorCode: expired.code },
      401,
      requestId,
      correlationId
    );
  }
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = ChangePasswordBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'AUTH_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }
  try {
    const { revokedCount } = await changePassword(getAuthDeps(), {
      userId: validated.userId,
      workspaceId: validated.workspaceId,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      correlationId,
    });
    // Log the rotation count, never either password.
    log.info('password changed', {
      route: '/api/auth/password/change',
      revokedCount,
    });
    return authJson(
      { ok: true, revokedCount },
      200,
      requestId,
      correlationId,
      buildClearedSessionCookie()
    );
  } catch (err) {
    if (err instanceof PasswordPolicyError) {
      return authJson(
        { error: err.message, errorCode: err.code },
        400,
        requestId,
        correlationId
      );
    }
    if (err instanceof InvalidCredentialsError) {
      return authJson(
        { error: err.message, errorCode: err.code },
        401,
        requestId,
        correlationId
      );
    }
    if (err instanceof ProfileValidationError) {
      return authJson(
        { error: err.message, errorCode: err.code },
        400,
        requestId,
        correlationId
      );
    }
    if (err instanceof ProfileForbiddenError) {
      return authJson(
        { error: err.message, errorCode: err.code },
        403,
        requestId,
        correlationId
      );
    }
    log.warn('password change failed', {
      route: '/api/auth/password/change',
      errorCode: 'AUTH_PASSWORD_CHANGE_FAILED',
    });
    return authJson(
      {
        error: 'Password change failed.',
        errorCode: 'AUTH_PASSWORD_CHANGE_FAILED',
      },
      500,
      requestId,
      correlationId
    );
  }
}
