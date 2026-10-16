/**
 * Stock-opname list / detail / post view mappers (US12 / RFC 03 task 30c).
 *
 * Builds on record mappers in `stock-count-views.ts` (task 30b). HPP value
 * fields stay optional so Staff responses omit them without sending null.
 */
import type {
  StockCountDetail,
  StockCountDetailLine,
  StockCountListItem,
  StockCountSessionRecord,
} from '@tokoboss/application';
import type {
  StockCountDetailLineView,
  StockCountDetailView,
  StockCountListItemView,
  StockCountPostResultView,
} from '@tokoboss/contracts';
import {
  toStockCountLineView,
  toStockCountSessionView,
} from '@/lib/stock-count-views';

function iso(date: Date): string {
  return date.toISOString();
}

export function toStockCountListItemView(
  item: StockCountListItem
): StockCountListItemView {
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    warehouseId: item.warehouseId,
    scopeType: item.scopeType,
    status: item.status,
    freezeOutboundTransfers: item.freezeOutboundTransfers,
    createdBy: item.createdBy,
    submittedBy: item.submittedBy,
    postedBy: item.postedBy,
    cancelledBy: item.cancelledBy,
    selfApproved: item.selfApproved,
    stale: item.stale,
    snapshotAt: iso(item.snapshotAt),
    lastActivityAt: iso(item.lastActivityAt),
    version: item.version,
  };
}

export function toStockCountDetailLineView(
  d: StockCountDetailLine
): StockCountDetailLineView {
  const view: StockCountDetailLineView = {
    line: toStockCountLineView(d.line),
    liveQty: d.liveQty,
    variance: d.variance,
    movement: d.movement,
    flags: d.flags,
  };
  if ('hppCents' in d) view.hppCents = d.hppCents ?? null;
  if ('varianceValueCents' in d) {
    view.varianceValueCents = d.varianceValueCents ?? null;
  }
  return view;
}

export function toStockCountDetailView(
  detail: StockCountDetail
): StockCountDetailView {
  const view: StockCountDetailView = {
    session: toStockCountSessionView(detail.session),
    lines: detail.lines.map(toStockCountDetailLineView),
    countedLines: detail.countedLines,
    uncountedLines: detail.uncountedLines,
    totalDelta: detail.totalDelta,
  };
  if (detail.totalValueCents !== undefined) {
    view.totalValueCents = detail.totalValueCents;
  }
  return view;
}

export function toStockCountPostResultView(result: {
  session: StockCountSessionRecord;
  postedLines: number;
  deduplicated: boolean;
}): StockCountPostResultView {
  return {
    session: toStockCountSessionView(result.session),
    postedLines: result.postedLines,
    deduplicated: result.deduplicated,
  };
}
