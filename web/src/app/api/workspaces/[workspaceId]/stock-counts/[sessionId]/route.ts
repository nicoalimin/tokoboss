/**
 * Stock-opname session detail (US12 / RFC 03 task 32).
 * GET /api/workspaces/:workspaceId/stock-counts/:sessionId
 *
 * Any active member (RFC 02 neutral 404). Warehouse scope and unknown
 * sessions return 404 STOCK_COUNT_NOT_FOUND from the use case; Rp values
 * at HPP are included only for Manager/Admin.
 */
import { getStockCount } from '@tokoboss/application';
import { authJson, routeContext } from '@/lib/auth-routes';
import { getCatalogStore } from '@/lib/catalog';
import { getStockCountStore, storageKind } from '@/lib/stock-count';
import { toStockCountDetailView } from '@/lib/stock-count-query-mappers';
import {
  admitStockCountMember,
  stockCountDenied,
  stockCountFailed,
  type RouteIds,
} from '@/lib/stock-count-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string; sessionId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { workspaceId, sessionId } = await params;
  const admitted = await admitStockCountMember(request, workspaceId);
  if (!admitted.ok) return stockCountDenied(admitted.denial, ids);
  try {
    const deps = {
      store: getStockCountStore(),
      catalog: getCatalogStore(),
    };
    const detail = await getStockCount(deps, {
      ctx: admitted.ctx,
      workspaceId,
      sessionId,
    });
    const body = {
      ...toStockCountDetailView(detail),
      storage: storageKind(),
    };
    return authJson(body, 200, ...ids, admitted.cookie);
  } catch (err) {
    return stockCountFailed(err, ids, 'Stock count detail failed.');
  }
}
