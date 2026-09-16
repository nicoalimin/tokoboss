import { getStockBalance } from '@tokoboss/application';
import {
  catalogErrorStatus,
  getCatalogStore,
  requireWorkspaceMember,
  slideForMember,
  storageKind,
  toStockBalanceView,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string; variantId: string }>;
}

/**
 * Consolidated + per-warehouse remaining for one SKU TokoBoss variant
 * (UTA-81, Story 05 — read API for the multi-warehouse UX).
 * GET /api/workspaces/:workspaceId/catalog/variants/:variantId/stock
 * (any active member; workspace-scoped; scoped roles see only their
 * warehouse line while the consolidated total stays workspace-wide).
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const { workspaceId, variantId } = await params;

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
    const balance = await getStockBalance(getCatalogStore(), {
      ctx: member.value.ctx,
      workspaceId: member.value.ctx.workspaceId,
      variantId,
    });
    return authJson(
      { balance: toStockBalanceView(balance), storage: storageKind() },
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
