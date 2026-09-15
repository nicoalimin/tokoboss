import {
  InvalidCredentialsError,
  RateLimitedError,
  signIn,
} from '@tokoboss/application';
import { AuthSignInBodySchema } from '@tokoboss/contracts';
import {
  buildSessionCookie,
  callerIp,
  getAuthDeps,
  storageKind,
} from '@/lib/auth';
import { authJson, routeContext } from '@/lib/auth-routes';

/**
 * Sign in with email + password (UTA-67).
 * POST /api/auth/sign-in
 *
 * Body: `{ email, password, workspaceId, platform: "web"|"mobile",
 * deviceLabel? }`. Creates one server-side session (unlimited concurrent
 * devices) with the platform idle TTL (web 30m / mobile 7d, no absolute
 * expiry). Web delivery is the HttpOnly `tb_session` cookie; mobile clients
 * use the `token` in the JSON body as a Bearer token.
 *
 * Failures are generic 401s (unknown email, wrong password, missing or
 * deactivated membership are indistinguishable); exhausted failure budgets
 * are 429s. Both emit `security.sign_in_failed` with identifier-free
 * payloads. Secrets are never logged.
 */
export async function POST(request: Request) {
  const { requestId, correlationId, log } = routeContext(request);

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = AuthSignInBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'AUTH_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const result = await signIn(getAuthDeps(), {
      email: parsed.data.email,
      password: parsed.data.password,
      workspaceId: parsed.data.workspaceId,
      platform: parsed.data.platform,
      deviceLabel: parsed.data.deviceLabel,
      ip: callerIp(request),
      correlationId,
    });
    // Log references only — never the token, email, or password.
    log.info('sign-in succeeded', {
      route: '/api/auth/sign-in',
      sessionId: result.session.id,
    });
    const isWeb = parsed.data.platform === 'web';
    return authJson(
      {
        session: result.session,
        userId: result.userId,
        workspaceId: result.workspaceId,
        ...(isWeb ? {} : { token: result.token }),
        storage: storageKind(),
      },
      200,
      requestId,
      correlationId,
      isWeb ? buildSessionCookie(result.token) : undefined
    );
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return authJson(
        { error: err.message, errorCode: err.code },
        429,
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
    log.warn('sign-in failed', {
      route: '/api/auth/sign-in',
      errorCode: 'AUTH_SIGN_IN_FAILED',
    });
    return authJson(
      { error: 'Sign-in failed.', errorCode: 'AUTH_SIGN_IN_FAILED' },
      500,
      requestId,
      correlationId
    );
  }
}
