import type {
  StockCountEntryMode,
  StockCountStatus,
} from './stock-count-rules';
import type {
  StockCountEntryRecord,
  StockCountLineRecord,
  StockCountScopeType,
  StockCountSessionRecord,
  StockCountVarianceReasonCode,
} from './stock-count-types';

/**
 * Input/result shapes for StockCountStore (US12 / RFC 03 task 7a).
 * The port itself: stock-count-ports.ts (task 7b).
 */

/** Session columns a transition (submit/return/cancel/freeze) may set. */
export type StockCountSessionChanges = Partial<
  Pick<
    StockCountSessionRecord,
    | 'status'
    | 'freezeOutboundTransfers'
    | 'submittedBy'
    | 'submittedAt'
    | 'submitNote'
    | 'returnedBy'
    | 'returnedAt'
    | 'returnNote'
    | 'cancelledBy'
    | 'cancelledAt'
    | 'cancelReason'
  >
>;

/** null variantIds = every active non-bundle variant in the warehouse. */
export interface CreateStockCountSessionInput {
  workspaceId: string;
  warehouseId: string;
  name: string;
  scopeType: StockCountScopeType;
  variantIds: string[] | null;
  freezeOutboundTransfers: boolean;
  actorId: string;
  now: Date;
}

export interface ListStockCountSessionsInput {
  workspaceId: string;
  /** null = every warehouse (Admin). */
  warehouseIds: string[] | null;
  statuses?: StockCountStatus[];
}

export interface RecordStockCountEntryInput {
  workspaceId: string;
  lineId: string;
  qty: number;
  mode: StockCountEntryMode;
  clientEntryId: string;
  deviceLabel: string | null;
  actorId: string;
  now: Date;
}

export interface RecordStockCountEntryResult {
  line: StockCountLineRecord;
  entry: StockCountEntryRecord;
  deduplicated: boolean;
}

export interface UpdateStockCountLineReviewInput {
  workspaceId: string;
  lineId: string;
  expectedVersion: number;
  varianceReasonCode: StockCountVarianceReasonCode | null;
  varianceNote: string | null;
  flagVerified: boolean;
}

/** clearReview (return) resets reasons/ticks; closeLines (cancel). */
export interface UpdateStockCountSessionInput {
  workspaceId: string;
  sessionId: string;
  expectedVersion: number;
  expectedStatus: StockCountStatus;
  changes: StockCountSessionChanges;
  clearReview?: boolean;
  closeLines?: boolean;
  now: Date;
}

export interface PostStockCountSessionInput {
  workspaceId: string;
  sessionId: string;
  expectedVersion: number;
  actorId: string;
  selfApproved: boolean;
  idempotencyKey: string;
  now: Date;
}

export interface StockCountPostResult {
  session: StockCountSessionRecord;
  postedLines: number;
  deduplicated: boolean;
}
