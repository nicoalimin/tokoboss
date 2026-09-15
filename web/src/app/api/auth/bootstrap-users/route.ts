import { timingSafeEqual } from 'node:crypto';
import { AuthBootstrapUserBodySchema } from '@tokoboss/contracts';
import { createBootstrapUser, storageKind } from '@/lib/auth';
import { authJson, routeContext } from '@/lib/auth-routes';

function hasValidBootstrapPassword(request: Request): boolean {
  const configured = process.env['AUTH_BOOTSTRAP_PASSWORD'];
  const supplied = request.headers.get('x-bootstrap-password');
  if (!configured || !supplied) return false;
  const expected = Buffer.from(configured);
  const actual = Buffer.from(supplied);
  return (
    expected.length === actual.length && timingSafeEqual(expected, actual)
  );
}

/**
 * Create a workspace and its initial Admin account.
 *
 * This setup endpoint is disabled until AUTH_BOOTSTRAP_PASSWORD is configured.
 * Supply that value in X-Bootstrap-Password; it is never returned or logged.
 */
export async function POST(request: Request) {
  const { requestId, correlationId, log } = routeContext(request);
  if (!hasValidBootstrapPassword(request)) {
    return authJson(
      { error: 'Not found.', errorCode: 'NOT_FOUND' },
      404,
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
  const parsed = AuthBootstrapUserBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'AUTH_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const result = await createBootstrapUser({
      ...parsed.data,
      correlationId,
    });
    log.info('bootstrap user created', {
      route: '/api/auth/bootstrap-users',
      workspaceId: result.workspaceId,
      userId: result.userId,
    });
    return authJson(
      { ...result, storage: storageKind() },
      201,
      requestId,
      correlationId
    );
  } catch (err) {
    log.warn('bootstrap user creation failed', {
      route: '/api/auth/bootstrap-users',
      errorCode: 'AUTH_BOOTSTRAP_FAILED',
    });
    return authJson(
      { error: 'User creation failed.', errorCode: 'AUTH_BOOTSTRAP_FAILED' },
      409,
      requestId,
      correlationId
    );
  }
}
