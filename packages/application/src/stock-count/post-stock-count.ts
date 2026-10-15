import type { CatalogStore } from '../catalog/catalog-ports';
import type { WorkspaceContext } from '../tenancy/tenancy-types';
import { assertManagerOrAdmin } from '../tenancy/workspace-context';
import {
  reviewLinesForPost,
  type StockCountLineReviewInput,
} from './post-stock-count-review';
import {
  stockCountValidation,
  stockCountVersionConflict,
} from './stock-count-errors';
import type { StockCountPostResult } from './stock-count-port-inputs';
import {
  loadScopedSession,
  requireTransition,
  type StockCountTransitionDeps,
} from './stock-count-transition-helpers';

/**
 * Post a submitted session (US12 / RFC 03 task 15b). Manager/Admin in
 * scope; reasons + re-verification ticks checked (15a) and saved; the
 * store applies ledger deltas and closes lines in one transaction.
 * selfApproved = poster also submitted. Replay with the same idempotency
 * key returns the stored result. Emits `stock_count.posted` once.
 */
export interface PostStockCountDeps extends StockCountTransitionDeps {
  catalog: Pick<CatalogStore, 'getLevel'>;
}

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9\-_:.]{8,128}$/;

export async function postStockCount(
  deps: PostStockCountDeps,
  input: {
    ctx: WorkspaceContext;
    workspaceId: string;
    sessionId: string;
    expectedVersion: number;
    idempotencyKey: string;
    lines?: StockCountLineReviewInput[];
    now: Date;
  }
): Promise<StockCountPostResult> {
  const { ctx, workspaceId, now } = input;
  const session = await loadScopedSession(
    deps.store,
    ctx,
    workspaceId,
    input.sessionId
  );
  assertManagerOrAdmin(ctx);
  const idempotencyKey = (input.idempotencyKey ?? '').trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw stockCountValidation('idempotencyKey tidak valid.');
  }
  const base = {
    workspaceId,
    sessionId: session.id,
    expectedVersion: input.expectedVersion,
    actorId: ctx.userId,
    idempotencyKey,
    now,
  };
  if (session.status === 'posted') {
    // Replay after a committed post: the store returns the stored result.
    return deps.store.postSession({
      ...base,
      selfApproved: session.selfApproved,
    });
  }
  requireTransition(session, 'post');
  if (session.version !== input.expectedVersion) {
    throw stockCountVersionConflict(session.version);
  }
  const lines = await deps.store.listLines(workspaceId, session.id);
  const counted = lines.filter((l) => l.countedQty !== null);
  const levels = await Promise.all(
    counted.map((l) =>
      deps.catalog.getLevel(workspaceId, l.variantId, l.warehouseId)
    )
  );
  const live = new Map(counted.map((l, i) => [l.id, levels[i]?.qty ?? 0]));
  const { reviewed, summary } = reviewLinesForPost(
    lines,
    input.lines ?? [],
    live
  );
  for (const r of reviewed.filter((x) => x.changed)) {
    await deps.store.updateLineReview({
      workspaceId,
      lineId: r.line.id,
      expectedVersion: r.line.version,
      varianceReasonCode: r.varianceReasonCode,
      varianceNote: r.varianceNote,
      flagVerified: r.flagVerified,
    });
  }
  const selfApproved = session.submittedBy === ctx.userId;
  const result = await deps.store.postSession({ ...base, selfApproved });
  if (!result.deduplicated) {
    await deps.audit.append({
      workspaceId,
      action: 'stock_count.posted',
      category: 'workspace',
      actorId: ctx.userId,
      correlationId: session.id,
      payload: {
        ...summary,
        submittedBy: session.submittedBy,
        postedBy: ctx.userId,
        selfApproved,
      },
    });
  }
  return result;
}
