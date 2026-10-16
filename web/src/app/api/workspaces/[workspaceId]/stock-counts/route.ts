/**
 * Stock-opname list / start (US12 / RFC 03 task 31b).
 * GET  /api/workspaces/:workspaceId/stock-counts[?status=counting,submitted]
 * POST /api/workspaces/:workspaceId/stock-counts (start a session)
 *
 * Any active member (RFC 02 neutral 404). Warehouse scope (404) and the
 * freeze role check (403) are enforced by the use cases.
 */
import {
  listStockCounts,
  startStockCount,
  type StockCountStatus,
} from '@tokoboss/application';
import { StartStockCountBodySchema } from '@tokoboss/contracts';
import { getAuthAudit } from '@/lib/auth';
import { authJson, routeContext } from '@/lib/auth-routes';
import { getCatalogStore } from '@/lib/catalog';
import { getStockCountStore, storageKind } from '@/lib/stock-count';
import { toStockCountListItemView } from '@/lib/stock-count-query-mappers';
import {
  admitStockCountMember,
  stockCountDenied,
  stockCountFailed,
  stockCountInvalid,
  type RouteIds,
} from '@/lib/stock-count-routes';
import { toStockCountSessionView } from '@/lib/stock-count-views';

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { workspaceId } = await params;
  const admitted = await admitStockCountMember(request, workspaceId);
  if (!admitted.ok) return stockCountDenied(admitted.denial, ids);
  const statuses = new URL(request.url).searchParams
    .getAll('status')
    .flatMap((s) => s.split(','))
    .map((s) => s.trim())
    .filter((s) => s.length > 0) as StockCountStatus[];
  try {
    const items = await listStockCounts(
      { store: getStockCountStore() },
      { ctx: admitted.ctx, workspaceId, statuses, now: new Date() }
    );
    const body = {
      sessions: items.map(toStockCountListItemView),
      storage: storageKind(),
    };
    return authJson(body, 200, ...ids, admitted.cookie);
  } catch (err) {
    return stockCountFailed(err, ids, 'Stock count list failed.');
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { workspaceId } = await params;
  const admitted = await admitStockCountMember(request, workspaceId);
  if (!admitted.ok) return stockCountDenied(admitted.denial, ids);
  const parsed = StartStockCountBodySchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) return stockCountInvalid(ids);
  try {
    const deps = {
      store: getStockCountStore(),
      catalog: getCatalogStore(),
      audit: getAuthAudit(),
    };
    const result = await startStockCount(deps, {
      ctx: admitted.ctx,
      workspaceId,
      ...parsed.data,
      now: new Date(),
    });
    log.info('stock count started', {
      route: '/api/workspaces/[workspaceId]/stock-counts',
      sessionId: result.session.id,
    });
    const body = {
      session: toStockCountSessionView(result.session),
      lineCount: result.lineCount,
      storage: storageKind(),
    };
    return authJson(body, 201, ...ids, admitted.cookie);
  } catch (err) {
    return stockCountFailed(err, ids, 'Stock count start failed.');
  }
}
