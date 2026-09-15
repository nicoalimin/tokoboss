import {
  PasswordPolicyError,
  PasswordResetError,
  confirmPasswordReset,
} from '@tokoboss/application';
import { PasswordResetConfirmBodySchema } from '@tokoboss/contracts';
import { getAuthDeps } from '@/lib/auth';
import { authJson, routeContext } from '@/lib/auth-routes';

/**
 * Confirm a password reset (UTA-67).
 * POST /api/auth/password-reset/confirm
 *
 * Rotates the password hash, revokes ALL sessions, bumps every membership
 * `auth_version`, and emits `security.password_reset` +
 * `security.forced_sign_out`. Weak passwords are 400s; bad/expired/used
 * tickets are generic 400s (no ticket oracle).
 */
export async function POST(request: Request) {
  const { requestId, correlationId, log } = routeContext(request);
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = PasswordResetConfirmBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'AUTH_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }
  try {
    await confirmPasswordReset(getAuthDeps(), {
      resetToken: parsed.data.resetToken,
      newPassword: parsed.data.newPassword,
      correlationId,
    });
    // Log the rotation, never the ticket or the new password.
    log.info('password reset confirmed', {
      route: '/api/auth/password-reset/confirm',
    });
    return authJson({ ok: true }, 200, requestId, correlationId);
  } catch (err) {
    if (err instanceof PasswordPolicyError) {
      return authJson(
        { error: err.message, errorCode: err.code },
        400,
        requestId,
        correlationId
      );
    }
    if (err instanceof PasswordResetError) {
      return authJson(
        { error: err.message, errorCode: err.code },
        400,
        requestId,
        correlationId
      );
    }
    log.warn('password-reset confirm failed', {
      route: '/api/auth/password-reset/confirm',
      errorCode: 'AUTH_RESET_CONFIRM_FAILED',
    });
    return authJson(
      {
        error: 'Password reset failed.',
        errorCode: 'AUTH_RESET_CONFIRM_FAILED',
      },
      500,
      requestId,
      correlationId
    );
  }
}
