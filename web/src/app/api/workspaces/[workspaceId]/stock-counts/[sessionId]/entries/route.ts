/**
 * Stock-opname count entry (US12 / RFC 03 task 33).
 * POST /api/workspaces/:workspaceId/stock-counts/:sessionId/entries
 *
 * Any active member (RFC 02 neutral 404). Warehouse scope, session state,
 * scan lookup and clientEntryId dedupe (same id + different payload = 409)
 * are enforced by the `recordCountEntry` use case. A new entry returns 201;
 * a deduplicated replay returns 200 with the original entry.
 */
import { recordCountEntry } from '@tokoboss/application';
import { RecordCountEntryBodySchema } from '@tokoboss/contracts';
import { authJson, routeContext } from '@/lib/auth-routes';
import { getStockCountStore, storageKind } from '@/lib/stock-count';
import {
  admitStockCountMember,
  stockCountDenied,
  stockCountFailed,
  stockCountInvalid,
  type RouteIds,
} from '@/lib/stock-count-routes';
import {
  toStockCountEntryView,
  toStockCountLineView,
} from '@/lib/stock-count-views';

interface RouteParams {
  params: Promise<{ workspaceId: string; sessionId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { workspaceId, sessionId } = await params;
  const admitted = await admitStockCountMember(request, workspaceId);
  if (!admitted.ok) return stockCountDenied(admitted.denial, ids);
  const parsed = RecordCountEntryBodySchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) return stockCountInvalid(ids);
  try {
    const result = await recordCountEntry(
      { store: getStockCountStore() },
      {
        ctx: admitted.ctx,
        workspaceId,
        sessionId,
        ...parsed.data,
        now: new Date(),
      }
    );
    const body = {
      line: toStockCountLineView(result.line),
      entry: toStockCountEntryView(result.entry),
      deduplicated: result.deduplicated,
      storage: storageKind(),
    };
    const status = result.deduplicated ? 200 : 201;
    return authJson(body, status, ...ids, admitted.cookie);
  } catch (err) {
    return stockCountFailed(err, ids, 'Stock count entry failed.');
  }
}
