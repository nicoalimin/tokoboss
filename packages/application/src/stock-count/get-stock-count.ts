import type { CatalogStore } from '../catalog/catalog-ports';
import type { WorkspaceContext } from '../tenancy/tenancy-types';
import type { StockCountStore } from './stock-count-ports';
import {
  computeMovement,
  computeVariance,
  flagReasons,
  type StockCountFlagReason,
} from './stock-count-rules';
import { loadScopedSession } from './stock-count-transition-helpers';
import type {
  StockCountLineRecord,
  StockCountSessionRecord,
} from './stock-count-types';

/**
 * Session detail (US12 / RFC 03 task 17b). Any member in warehouse scope;
 * out of scope or unknown = STOCK_COUNT_NOT_FOUND. Per line: variance (D1,
 * null when uncounted), movement during count (uncounted lines use live
 * minus snapshot, info only) and D4 flags. Rp values at HPP are returned
 * only for Manager/Admin; the fields are omitted for Staff, and a line
 * whose SKU has no HPP gets null (left out of the total).
 */
export interface StockCountDetailLine {
  line: StockCountLineRecord;
  liveQty: number;
  variance: number | null;
  movement: number;
  flags: StockCountFlagReason[];
  hppCents?: number | null;
  varianceValueCents?: number | null;
}

export interface StockCountDetail {
  session: StockCountSessionRecord;
  lines: StockCountDetailLine[];
  countedLines: number;
  uncountedLines: number;
  totalDelta: number;
  totalValueCents?: number;
}

export async function getStockCount(
  deps: {
    store: StockCountStore;
    catalog: Pick<CatalogStore, 'getLevel' | 'findVariantById'>;
  },
  input: { ctx: WorkspaceContext; workspaceId: string; sessionId: string }
): Promise<StockCountDetail> {
  const { ctx, workspaceId } = input;
  const session = await loadScopedSession(
    deps.store,
    ctx,
    workspaceId,
    input.sessionId
  );
  const showValue = ctx.role === 'admin' || ctx.role === 'manager';
  const records = await deps.store.listLines(workspaceId, session.id);
  const lines = await Promise.all(
    records.map(async (line): Promise<StockCountDetailLine> => {
      const level = await deps.catalog.getLevel(
        workspaceId,
        line.variantId,
        line.warehouseId
      );
      const liveQty = level?.qty ?? 0;
      const variance = computeVariance(line);
      const detail: StockCountDetailLine = {
        line,
        liveQty,
        variance,
        movement: computeMovement(
          line.snapshotQty,
          line.systemQtyAtCount ?? liveQty
        ),
        flags: flagReasons(line, liveQty),
      };
      if (!showValue) return detail;
      const variant = await deps.catalog.findVariantById(
        workspaceId,
        line.variantId
      );
      const hppCents = variant?.hppCents ?? null;
      detail.hppCents = hppCents;
      detail.varianceValueCents =
        variance === null || hppCents === null ? null : variance * hppCents;
      return detail;
    })
  );
  const counted = lines.filter((l) => l.variance !== null);
  const result: StockCountDetail = {
    session,
    lines,
    countedLines: counted.length,
    uncountedLines: lines.length - counted.length,
    totalDelta: counted.reduce((sum, l) => sum + (l.variance ?? 0), 0),
  };
  if (showValue) {
    result.totalValueCents = lines.reduce(
      (sum, l) => sum + (l.varianceValueCents ?? 0),
      0
    );
  }
  return result;
}
