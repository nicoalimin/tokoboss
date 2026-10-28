/**
 * Post a submitted stock-opname session (US12 / RFC 03 task 35).
 * POST /api/workspaces/:workspaceId/stock-counts/:sessionId/post
 * Body: { expectedVersion, idempotencyKey, lines?: [{ lineId,
 *   varianceReasonCode?, varianceNote?, flagVerified? }] }
 *
 * Any active member (RFC 02 neutral 404). Manager/Admin role (403),
 * warehouse scope (404 STOCK_COUNT_NOT_FOUND), line reasons and
 * re-verification ticks (400), the state machine and expectedVersion
 * conflicts (409) are enforced by `postStockCount`. Returns 200 with the
 * posted session; a replay with the same idempotencyKey returns the stored
 * result with `deduplicated: true`.
 */
import { postStockCount } from '@tokoboss/application';
import { PostStockCountBodySchema } from '@tokoboss/contracts';
import { getAuthAudit } from '@/lib/auth';
import { authJson, routeContext } from '@/lib/auth-routes';
import { triggerVariantInventorySync } from '@/lib/inventory-sync';
import { getCatalogStore } from '@/lib/catalog';
import { getStockCountStore, storageKind } from '@/lib/stock-count';
import { toStockCountPostResultView } from '@/lib/stock-count-query-mappers';
import {
  admitStockCountMember,
  stockCountDenied,
  stockCountFailed,
  stockCountInvalid,
  type RouteIds,
} from '@/lib/stock-count-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string; sessionId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { workspaceId, sessionId } = await params;
  const admitted = await admitStockCountMember(request, workspaceId);
  if (!admitted.ok) return stockCountDenied(admitted.denial, ids);
  const parsed = PostStockCountBodySchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) return stockCountInvalid(ids);
  const { expectedVersion, idempotencyKey, lines } = parsed.data;
  try {
    const deps = {
      store: getStockCountStore(),
      catalog: getCatalogStore(),
      audit: getAuthAudit(),
    };
    const result = await postStockCount(deps, {
      ctx: admitted.ctx,
      workspaceId,
      sessionId,
      expectedVersion,
      idempotencyKey,
      lines: lines ?? [],
      now: new Date(),
    });
    // Best-effort marketplace stock push (US04 / RFC 06 row 43); never throws.
    const read = deps.store.listLines(workspaceId, sessionId);
    const posted = (await read.catch(() => [])).filter((l) => l.ledgerEntryId);
    const variantIds = [...new Set(posted.map((l) => l.variantId))];
    const sync = { workspaceId, variantIds, correlationId };
    const actorId = admitted.ctx.userId;
    const trigger = 'stock_count_post' as const;
    await triggerVariantInventorySync({ ...sync, actorId, trigger }, log);
    const body = {
      ...toStockCountPostResultView(result),
      storage: storageKind(),
    };
    return authJson(body, 200, ...ids, admitted.cookie);
  } catch (err) {
    return stockCountFailed(err, ids, 'Stock count post failed.');
  }
}
