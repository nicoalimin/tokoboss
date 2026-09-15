import {
  InvalidSessionError,
  ProfileForbiddenError,
  ProfileValidationError,
  getMe,
  updateProfile,
} from '@tokoboss/application';
import { UpdateProfileBodySchema } from '@tokoboss/contracts';
import {
  getCredentialStore,
  getProfileStore,
  requireSessionToken,
  slideSessionCookie,
} from '@/lib/auth';
import { getUploadStore } from '@/lib/uploads';
import { authJson, routeContext } from '@/lib/auth-routes';

/**
 * Read the caller's own profile (UTA-72).
 * GET /api/auth/me
 *
 * Requires a valid session (Bearer or cookie). Returns the client-safe
 * profile projection — opaque ids + own email + display name + avatar
 * file reference. No hashes, no tokens, no other users' data. Validating
 * slides the server idle clock; cookie web sessions also get a refreshed
 * `Set-Cookie`.
 */
export async function GET(request: Request) {
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
  try {
    const profile = await getMe(
      { credentials: getCredentialStore(), profiles: getProfileStore() },
      validated.userId
    );
    log.info('profile read', { route: '/api/auth/me' });
    return authJson(
      { profile },
      200,
      requestId,
      correlationId,
      slideSessionCookie(validated)
    );
  } catch (err) {
    if (err instanceof ProfileForbiddenError) {
      return authJson(
        { error: err.message, errorCode: err.code },
        403,
        requestId,
        correlationId
      );
    }
    log.warn('profile read failed', {
      route: '/api/auth/me',
      errorCode: 'PROFILE_READ_FAILED',
    });
    return authJson(
      { error: 'Profile read failed.', errorCode: 'PROFILE_READ_FAILED' },
      500,
      requestId,
      correlationId
    );
  }
}

/**
 * Update the caller's own profile (UTA-72).
 * PATCH /api/auth/me
 *
 * Body: `{ displayName?, avatarUploadId? }` (at least one). There is no
 * target-user parameter — cross-user updates are structurally impossible;
 * extra `userId` fields in the body are ignored (stripped by the contract
 * schema), never used as a target. `avatarUploadId`
 * must reference a completed image `file_uploads` row in the caller's
 * workspace (private Blob reference, never bytes or URLs).
 */
export async function PATCH(request: Request) {
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
  const parsed = UpdateProfileBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'AUTH_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }
  try {
    const profile = await updateProfile(
      {
        credentials: getCredentialStore(),
        profiles: getProfileStore(),
        uploads: getUploadStore(),
      },
      {
        userId: validated.userId,
        workspaceId: validated.workspaceId,
        displayName: parsed.data.displayName,
        avatarUploadId: parsed.data.avatarUploadId,
        correlationId,
      }
    );
    // Log the update, never the display name or avatar reference values
    // verbatim (own-PII stays out of logs; ids are opaque but omitted).
    log.info('profile updated', { route: '/api/auth/me' });
    return authJson(
      { profile },
      200,
      requestId,
      correlationId,
      slideSessionCookie(validated)
    );
  } catch (err) {
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
    if (
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: unknown }).code === 'TENANCY_VALIDATION'
    ) {
      return authJson(
        {
          error: err instanceof Error ? err.message : 'Invalid request.',
          errorCode: 'TENANCY_VALIDATION',
        },
        400,
        requestId,
        correlationId
      );
    }
    log.warn('profile update failed', {
      route: '/api/auth/me',
      errorCode: 'PROFILE_UPDATE_FAILED',
    });
    return authJson(
      { error: 'Profile update failed.', errorCode: 'PROFILE_UPDATE_FAILED' },
      500,
      requestId,
      correlationId
    );
  }
}
