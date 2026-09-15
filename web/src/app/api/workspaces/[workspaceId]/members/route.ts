import { listMembers } from '@tokoboss/application';
import { getMemberStore, storageKind } from '@/lib/auth';
import {
  requireWorkspaceAdmin,
  slideForAdmin,
  toMemberView,
} from '@/lib/membership';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

/**
 * List workspace members (UTA-70).
 * GET /api/workspaces/:workspaceId/members (Admin-only)
 *
 * Records carry opaque user ids only (no PII), returned newest-last in
 * store order. Cross-workspace callers get a generic 403.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const { workspaceId } = await params;

  const admin = await requireWorkspaceAdmin(request, workspaceId);
  if (!admin.ok) {
    return authJson(
      { error: admin.denial.error, errorCode: admin.denial.errorCode },
      admin.denial.status,
      requestId,
      correlationId
    );
  }
  const members = await listMembers(getMemberStore(), {
    ctx: admin.value.ctx,
    workspaceId: admin.value.ctx.workspaceId,
  });
  return authJson(
    { members: members.map(toMemberView), storage: storageKind() },
    200,
    requestId,
    correlationId,
    slideForAdmin(admin.value)
  );
}
