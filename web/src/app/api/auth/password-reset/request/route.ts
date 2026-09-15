import { requestPasswordReset } from '@tokoboss/application';
import { PasswordResetRequestBodySchema } from '@tokoboss/contracts';
import { getAuthDeps, storageKind } from '@/lib/auth';
import { authJson, routeContext } from '@/lib/auth-routes';

/**
 * Request a password reset (UTA-67).
 * POST /api/auth/password-reset/request
 *
 * Always returns the same generic shape whether the email exists (no
 * enumeration oracle). The MVP has no mailer yet: the single-use ticket is
 * exposed in the response ONLY when `AUTH_INCLUDE_RESET_TOKEN=true`
 * (local fixture mode, never production) so the confirm flow is drivable.
 */
export async function POST(request: Request) {
  const { requestId, correlationId, log } = routeContext(request);
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = PasswordResetRequestBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'AUTH_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }
  try {
    const { resetToken } = await requestPasswordReset(getAuthDeps(), {
      email: parsed.data.email,
      correlationId,
    });
    // Log the request, never the email or ticket.
    log.info('password-reset requested', {
      route: '/api/auth/password-reset/request',
    });
    const includeToken =
      process.env['AUTH_INCLUDE_RESET_TOKEN'] === 'true' && resetToken;
    return authJson(
      {
        ok: true,
        message: 'If the email exists, a reset ticket was created.',
        storage: storageKind(),
        ...(includeToken ? { resetToken } : {}),
      },
      200,
      requestId,
      correlationId
    );
  } catch {
    log.warn('password-reset request failed', {
      route: '/api/auth/password-reset/request',
      errorCode: 'AUTH_RESET_REQUEST_FAILED',
    });
    return authJson(
      { error: 'Request failed.', errorCode: 'AUTH_RESET_REQUEST_FAILED' },
      500,
      requestId,
      correlationId
    );
  }
}
