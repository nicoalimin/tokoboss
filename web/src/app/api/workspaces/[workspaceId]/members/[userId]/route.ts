import { changeMember } from '@tokoboss/application';
import { UpdateMemberBodySchema } from '@tokoboss/contracts';
import { getAuthAudit, getMemberStore } from '@/lib/auth';
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
 * Update a member's role / warehouse scope (UTA-70).
 * PATCH /api/workspaces/:workspaceId/members/:userId (Admin-only)
 *
 * Body: `{ role?, warehouseScope? }` (at least one). Every effective
 * change bumps `auth_version` so pre-change sessions go auth-stale;
 * demoting/deactivating the last active Admin is rejected with 409
 * (`TENANCY_LAST_ADMIN`). Status changes ride here too, but prefer the
 * explicit deactivate endpoint for removals (it revokes session rows now).
 */
export async function PATCH(request: Request, { params }: RouteParams) {
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

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = UpdateMemberBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'TENANCY_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const updated = await changeMember(
      getMemberStore(),
      {
        ctx: admin.value.ctx,
        workspaceId: admin.value.ctx.workspaceId,
        targetUserId: userId,
        role: parsed.data.role,
        warehouseScope:
          parsed.data.warehouseScope !== undefined
            ? parsed.data.warehouseScope
            : undefined,
        correlationId,
      },
      getAuthAudit()
    );
    log.info('member updated', {
      route: '/api/workspaces/[workspaceId]/members/[userId]',
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
      log.warn('member update failed', {
        route: '/api/workspaces/[workspaceId]/members/[userId]',
        errorCode: mapped.errorCode,
      });
      return authJson(
        { error: 'Update failed.', errorCode: mapped.errorCode },
        500,
        requestId,
        correlationId
      );
    }
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Update failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
