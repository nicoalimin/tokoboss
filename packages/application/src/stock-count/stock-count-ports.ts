import type {
  CreateStockCountSessionInput,
  ListStockCountSessionsInput,
  PostStockCountSessionInput,
  RecordStockCountEntryInput,
  RecordStockCountEntryResult,
  StockCountPostResult,
  UpdateStockCountLineReviewInput,
  UpdateStockCountSessionInput,
} from './stock-count-port-inputs';
import type {
  StockCountEntryRecord,
  StockCountLineRecord,
  StockCountSessionRecord,
} from './stock-count-types';

/**
 * Persistence port for stock opname (US12 / RFC 03 task 7b).
 *
 * Every method is workspace-scoped; cross-workspace misses return null
 * (use-cases map them to `stockCountNotFound`). Session and line writes
 * take `expectedVersion` and throw `STOCK_COUNT_VERSION_CONFLICT` when
 * stale. A second open line for warehouse+SKU throws `STOCK_COUNT_OVERLAP`.
 */
export interface StockCountStore {
  /** Active non-bundle variants in scope (null variantIds = all). */
  countEligibleVariants(input: {
    workspaceId: string;
    warehouseId: string;
    variantIds: string[] | null;
  }): Promise<number>;

  /** Session + snapshot lines in one transaction; allocates `code`. */
  createSession(
    input: CreateStockCountSessionInput
  ): Promise<{ session: StockCountSessionRecord; lineCount: number }>;

  findSession(
    workspaceId: string,
    sessionId: string
  ): Promise<StockCountSessionRecord | null>;

  listSessions(
    input: ListStockCountSessionsInput
  ): Promise<StockCountSessionRecord[]>;

  /** First counting/submitted session in the warehouse (guards). */
  findActiveSession(
    workspaceId: string,
    warehouseId: string,
    options?: { freezingOnly?: boolean }
  ): Promise<StockCountSessionRecord | null>;

  listLines(
    workspaceId: string,
    sessionId: string
  ): Promise<StockCountLineRecord[]>;

  /** Barcode, then sku_code, among the session's lines only. */
  findLineByScan(
    workspaceId: string,
    sessionId: string,
    code: string
  ): Promise<StockCountLineRecord | null>;

  listEntries(
    workspaceId: string,
    lineId: string
  ): Promise<StockCountEntryRecord[]>;

  /** Row-locked add/replace; same clientEntryId returns the stored result. */
  recordEntry(
    input: RecordStockCountEntryInput
  ): Promise<RecordStockCountEntryResult>;

  updateLineReview(
    input: UpdateStockCountLineReviewInput
  ): Promise<StockCountLineRecord>;

  /** Submit / return / cancel / freeze, guarded on version + status. */
  updateSession(
    input: UpdateStockCountSessionInput
  ): Promise<StockCountSessionRecord>;

  /** One transaction: ledger deltas via adjustLevel, close all lines. */
  postSession(input: PostStockCountSessionInput): Promise<StockCountPostResult>;
}
