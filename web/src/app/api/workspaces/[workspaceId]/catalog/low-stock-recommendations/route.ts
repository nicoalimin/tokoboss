import { listLowStockRecommendations } from '@tokoboss/application';
import {
  catalogErrorStatus,
  getCatalogStore,
  requireWorkspaceMember,
  slideForMember,
  storageKind,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

/**
 * List low-stock recommendations (UTA-146 Slice 1b / Story 11).
 * GET /api/workspaces/:workspaceId/catalog/low-stock-recommendations
 * (any active member; workspace-scoped). Read-only.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const { workspaceId } = await params;

  const member = await requireWorkspaceMember(request, workspaceId);
  if (!member.ok) {
    return authJson(
      { error: member.denial.error, errorCode: member.denial.errorCode },
      member.denial.status,
      requestId,
      correlationId
    );
  }

  try {
    const recommendations = await listLowStockRecommendations(
      getCatalogStore(),
      {
        ctx: member.value.ctx,
        workspaceId: member.value.ctx.workspaceId,
      }
    );
    return authJson(
      {
        recommendations,
        storage: storageKind(),
      },
      200,
      requestId,
      correlationId,
      slideForMember(member.value)
    );
  } catch (err) {
    const mapped = catalogErrorStatus(err);
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Catalog read failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
