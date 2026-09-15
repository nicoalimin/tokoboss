import { deactivateMember } from '@tokoboss/application';
import { getAuthAudit, getMemberStore, getSessionStore } from '@/lib/auth';
import {
  membershipErrorStatus,
  requireWorkspaceAdmin,
  slideForAdmin,
  toMemberView,
} from '@/lib/membership';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string; userId: string }>;
}

/**
 * Deactivate a member (UTA-70).
 * POST /api/workspaces/:workspaceId/members/:userId/deactivate (Admin-only)
 *
 * Bumps `auth_version` AND revokes every session row for the user now
 * (not lazily on next validation), then emits
 * `security.forced_sign_out` (`admin_deactivate`) — the same revoke-all
 * shape as the password-reset flow (UTA-67 hooks). Deactivating the last
 * active Admin is rejected with 409 (`TENANCY_LAST_ADMIN`).
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const { workspaceId, userId } = await params;

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
    const updated = await deactivateMember(
      getMemberStore(),
      {
        ctx: admin.value.ctx,
        workspaceId: admin.value.ctx.workspaceId,
        targetUserId: userId,
        correlationId,
      },
      getAuthAudit(),
      getSessionStore()
    );
    log.info('member deactivated', {
      route: '/api/workspaces/[workspaceId]/members/[userId]/deactivate',
      memberId: updated.id,
    });
    return authJson(
      { member: toMemberView(updated) },
      200,
      requestId,
      correlationId,
      slideForAdmin(admin.value)
    );
  } catch (err) {
    const mapped = membershipErrorStatus(err);
    if (mapped.status === 500) {
      log.warn('member deactivate failed', {
        route: '/api/workspaces/[workspaceId]/members/[userId]/deactivate',
        errorCode: mapped.errorCode,
      });
      return authJson(
        { error: 'Deactivate failed.', errorCode: mapped.errorCode },
        500,
        requestId,
        correlationId
      );
    }
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Deactivate failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
