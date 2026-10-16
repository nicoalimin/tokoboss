/**
 * Stock-opname record → wire view mappers (US12 / RFC 03 task 30b).
 *
 * Session / line / entry rows only. List, detail, and post envelopes
 * are task 30c (`stock-count-query-mappers.ts`). Store factory and
 * error→status live in `stock-count.ts` (task 30a).
 */
import type {
  StockCountEntryRecord,
  StockCountLineRecord,
  StockCountSessionRecord,
  StockCountStatus,
} from '@tokoboss/application';
import type {
  StockCountEntryView,
  StockCountLineView,
  StockCountSessionView,
} from '@tokoboss/contracts';

function iso(date: Date): string {
  return date.toISOString();
}

function isoOrNull(date: Date | null): string | null {
  return date ? iso(date) : null;
}

export function toStockCountSessionView(
  s: StockCountSessionRecord
): StockCountSessionView {
  return {
    id: s.id,
    workspaceId: s.workspaceId,
    warehouseId: s.warehouseId,
    code: s.code,
    name: s.name,
    scopeType: s.scopeType,
    status: s.status as StockCountStatus,
    freezeOutboundTransfers: s.freezeOutboundTransfers,
    snapshotAt: iso(s.snapshotAt),
    createdBy: s.createdBy,
    submittedBy: s.submittedBy,
    submittedAt: isoOrNull(s.submittedAt),
    submitNote: s.submitNote,
    returnedBy: s.returnedBy,
    returnedAt: isoOrNull(s.returnedAt),
    returnNote: s.returnNote,
    postedBy: s.postedBy,
    postedAt: isoOrNull(s.postedAt),
    cancelledBy: s.cancelledBy,
    cancelledAt: isoOrNull(s.cancelledAt),
    cancelReason: s.cancelReason,
    selfApproved: s.selfApproved,
    lastActivityAt: iso(s.lastActivityAt),
    version: s.version,
    createdAt: iso(s.createdAt),
    updatedAt: iso(s.updatedAt),
  };
}

export function toStockCountLineView(
  l: StockCountLineRecord
): StockCountLineView {
  return {
    id: l.id,
    workspaceId: l.workspaceId,
    sessionId: l.sessionId,
    warehouseId: l.warehouseId,
    variantId: l.variantId,
    snapshotQty: l.snapshotQty,
    countedQty: l.countedQty,
    systemQtyAtCount: l.systemQtyAtCount,
    countedAt: isoOrNull(l.countedAt),
    countedBy: l.countedBy,
    entryCount: l.entryCount,
    varianceReasonCode: l.varianceReasonCode,
    varianceNote: l.varianceNote,
    flagVerified: l.flagVerified,
    ledgerEntryId: l.ledgerEntryId,
    isOpen: l.isOpen,
    version: l.version,
    createdAt: iso(l.createdAt),
    updatedAt: iso(l.updatedAt),
  };
}

export function toStockCountEntryView(
  e: StockCountEntryRecord
): StockCountEntryView {
  return {
    id: e.id,
    workspaceId: e.workspaceId,
    sessionId: e.sessionId,
    lineId: e.lineId,
    qty: e.qty,
    mode: e.mode as StockCountEntryView['mode'],
    clientEntryId: e.clientEntryId,
    deviceLabel: e.deviceLabel,
    actorId: e.actorId,
    createdAt: iso(e.createdAt),
  };
}
