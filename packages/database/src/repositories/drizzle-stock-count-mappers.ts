import {
  STOCK_COUNT_SCOPE_TYPES,
  STOCK_COUNT_VARIANCE_REASON_CODES,
  type StockCountLineRecord,
  type StockCountScopeType,
  type StockCountSessionRecord,
  type StockCountVarianceReasonCode,
} from '@tokoboss/application';
import type { StockCountLineRow, StockCountSessionRow } from '../schema/index';

/**
 * Row → record mappers for stock-count sessions and lines
 * (US12 / RFC 03 task 22a). Used by `DrizzleStockCountStore`.
 */

function asScopeType(value: string): StockCountScopeType {
  if (!(STOCK_COUNT_SCOPE_TYPES as readonly string[]).includes(value)) {
    throw new Error(`STOCK_COUNT_CORRUPT: unknown scope type ${value}`);
  }
  return value as StockCountScopeType;
}

function asVarianceReason(
  value: string | null
): StockCountVarianceReasonCode | null {
  if (value === null) return null;
  if (
    !(STOCK_COUNT_VARIANCE_REASON_CODES as readonly string[]).includes(value)
  ) {
    throw new Error(`STOCK_COUNT_CORRUPT: unknown variance reason ${value}`);
  }
  return value as StockCountVarianceReasonCode;
}

export function toStockCountSession(
  row: StockCountSessionRow
): StockCountSessionRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    warehouseId: row.warehouseId,
    code: row.code,
    name: row.name,
    scopeType: asScopeType(row.scopeType),
    status: row.status,
    freezeOutboundTransfers: row.freezeOutboundTransfers,
    snapshotAt: row.snapshotAt,
    createdBy: row.createdBy,
    submittedBy: row.submittedBy ?? null,
    submittedAt: row.submittedAt ?? null,
    submitNote: row.submitNote ?? null,
    returnedBy: row.returnedBy ?? null,
    returnedAt: row.returnedAt ?? null,
    returnNote: row.returnNote ?? null,
    postedBy: row.postedBy ?? null,
    postedAt: row.postedAt ?? null,
    cancelledBy: row.cancelledBy ?? null,
    cancelledAt: row.cancelledAt ?? null,
    cancelReason: row.cancelReason ?? null,
    selfApproved: row.selfApproved,
    lastActivityAt: row.lastActivityAt,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toStockCountLine(row: StockCountLineRow): StockCountLineRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    sessionId: row.sessionId,
    warehouseId: row.warehouseId,
    variantId: row.variantId,
    snapshotQty: row.snapshotQty,
    countedQty: row.countedQty ?? null,
    systemQtyAtCount: row.systemQtyAtCount ?? null,
    countedAt: row.countedAt ?? null,
    countedBy: row.countedBy ?? null,
    entryCount: row.entryCount,
    varianceReasonCode: asVarianceReason(row.varianceReasonCode),
    varianceNote: row.varianceNote ?? null,
    flagVerified: row.flagVerified,
    ledgerEntryId: row.ledgerEntryId ?? null,
    isOpen: row.isOpen,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
