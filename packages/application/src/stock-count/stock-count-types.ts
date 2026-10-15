/**
 * Stock-opname record vocabulary (US12 / RFC 03 task 6a).
 * Status/mode/action/ledger/flag types: stock-count-rules.ts.
 * Error helpers: stock-count-errors.ts (task 6b). Wire DTOs: contracts.
 */

export const STOCK_COUNT_SCOPE_TYPES = ['all', 'skus'] as const;
export type StockCountScopeType = (typeof STOCK_COUNT_SCOPE_TYPES)[number];

export const STOCK_COUNT_VARIANCE_REASON_CODES = [
  'damaged_expired',
  'lost',
  'prior_input_error',
  'unrecorded_receipt',
  'other',
] as const;
export type StockCountVarianceReasonCode =
  (typeof STOCK_COUNT_VARIANCE_REASON_CODES)[number];

/** Count session row exchanged with StockCountStore. */
export interface StockCountSessionRecord {
  id: string;
  workspaceId: string;
  warehouseId: string;
  code: string;
  name: string;
  scopeType: StockCountScopeType;
  status: string;
  freezeOutboundTransfers: boolean;
  snapshotAt: Date;
  createdBy: string;
  submittedBy: string | null;
  submittedAt: Date | null;
  submitNote: string | null;
  returnedBy: string | null;
  returnedAt: Date | null;
  returnNote: string | null;
  postedBy: string | null;
  postedAt: Date | null;
  cancelledBy: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  selfApproved: boolean;
  lastActivityAt: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** One SKU line in a session (null countedQty = uncounted). */
export interface StockCountLineRecord {
  id: string;
  workspaceId: string;
  sessionId: string;
  warehouseId: string;
  variantId: string;
  snapshotQty: number;
  countedQty: number | null;
  systemQtyAtCount: number | null;
  countedAt: Date | null;
  countedBy: string | null;
  entryCount: number;
  varianceReasonCode: StockCountVarianceReasonCode | null;
  varianceNote: string | null;
  flagVerified: boolean;
  ledgerEntryId: string | null;
  isOpen: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Append-only scan/typed entry on a line. */
export interface StockCountEntryRecord {
  id: string;
  workspaceId: string;
  sessionId: string;
  lineId: string;
  qty: number;
  mode: string;
  clientEntryId: string;
  deviceLabel: string | null;
  actorId: string;
  createdAt: Date;
}
