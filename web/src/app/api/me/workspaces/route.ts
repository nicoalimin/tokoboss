import {
  InvalidSessionError,
  listAccessibleWorkspaces,
  toInviteView,
} from '@tokoboss/application';
import type { MeWorkspacesResponse } from '@tokoboss/contracts';
import {
  getCredentialStore,
  getMemberStore,
  getWorkspaceStore,
  requireSessionToken,
  slideSessionCookie,
  storageKind,
} from '@/lib/auth';
import { getInviteStore } from '@/lib/membership';
import { authJson, routeContext } from '@/lib/auth-routes';

/**
 * List accessible workspaces + pending invites for the account
 * (US29 / RFC 02 row 33). GET /api/me/workspaces
 *
 * Needs a valid account session only (no workspace membership). Never
 * names deactivated memberships or workspaces. Pending invites are for
 * the caller's email across workspaces. Secrets/emails stay out of logs.
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
    const credential = await getCredentialStore().findByUserId(
      validated.userId
    );
    if (!credential) {
      const expired = new InvalidSessionError();
      return authJson(
        { error: expired.message, errorCode: expired.code },
        401,
        requestId,
        correlationId
      );
    }

    const now = new Date();
    const [items, pending] = await Promise.all([
      listAccessibleWorkspaces(
        getMemberStore(),
        getWorkspaceStore(),
        validated.userId
      ),
      getInviteStore().listPendingByEmail(credential.email, now),
    ]);

    const body: MeWorkspacesResponse = {
      workspaces: items.map((w) => ({
        workspaceId: w.workspaceId,
        name: w.name,
        initials: w.initials,
        role: w.role,
        warehouseScopeLabel: w.warehouseScopeLabel,
        lastActiveAt: w.lastActiveAt ? w.lastActiveAt.toISOString() : null,
      })),
      pendingInvites: pending.map(toInviteView),
    };

    log.info('me workspaces listed', { route: '/api/me/workspaces' });
    return authJson(
      { ...body, storage: storageKind() },
      200,
      requestId,
      correlationId,
      slideSessionCookie(validated)
    );
  } catch {
    log.warn('me workspaces failed', {
      route: '/api/me/workspaces',
      errorCode: 'ME_WORKSPACES_FAILED',
    });
    return authJson(
      { error: 'Workspace list failed.', errorCode: 'ME_WORKSPACES_FAILED' },
      500,
      requestId,
      correlationId
    );
  }
}
