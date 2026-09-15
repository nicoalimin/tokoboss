import { revokeInvite } from '@tokoboss/application';
import { getAuthAudit } from '@/lib/auth';
import {
  getInviteStore,
  membershipErrorStatus,
  requireWorkspaceAdmin,
  slideForAdmin,
} from '@/lib/membership';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string; inviteId: string }>;
}

/**
 * Revoke a pending invite ticket (UTA-70).
 * DELETE /api/workspaces/:workspaceId/invites/:inviteId (Admin-only)
 *
 * Consumed (accepted/revoked/expired) tickets reject with a generic 404 so
 * callers learn nothing about other workspaces' tickets.
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const { workspaceId, inviteId } = await params;

  const admin = await requireWorkspaceAdmin(request, workspaceId);
  if (!admin.ok) {
    return authJson(
      { error: admin.denial.error, errorCode: admin.denial.errorCode },
      admin.denial.status,
      requestId,
      correlationId
    );
  }

  try {
    await revokeInvite(
      getInviteStore(),
      {
        ctx: admin.value.ctx,
        workspaceId: admin.value.ctx.workspaceId,
        inviteId,
        correlationId,
      },
      getAuthAudit()
    );
    log.info('invite revoked', {
      route: '/api/workspaces/[workspaceId]/invites/[inviteId]',
      inviteId,
    });
    return authJson(
      { revoked: true },
      200,
      requestId,
      correlationId,
      slideForAdmin(admin.value)
    );
  } catch (err) {
    const mapped = membershipErrorStatus(err);
    if (mapped.status === 500) {
      log.warn('invite revoke failed', {
        route: '/api/workspaces/[workspaceId]/invites/[inviteId]',
        errorCode: mapped.errorCode,
      });
      return authJson(
        { error: 'Revoke failed.', errorCode: mapped.errorCode },
        500,
        requestId,
        correlationId
      );
    }
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Revoke failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
