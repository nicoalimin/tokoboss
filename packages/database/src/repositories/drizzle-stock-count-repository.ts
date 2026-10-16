import type {
  CreateStockCountSessionInput,
  ListStockCountSessionsInput,
  PostStockCountSessionInput,
  RecordStockCountEntryInput,
  StockCountStore,
  UpdateStockCountLineReviewInput,
  UpdateStockCountSessionInput,
} from '@tokoboss/application';
import type { DatabaseHandle, Transaction } from '../db';
import { createSession } from './drizzle-stock-count-create';
import { countEligibleVariants } from './drizzle-stock-count-eligible';
import {
  findLineByScan,
  listEntries,
  updateLineReview,
} from './drizzle-stock-count-lines';
import { updateSession } from './drizzle-stock-count-session-writes';
import {
  findActiveSession,
  findSession,
  listLines,
  listSessions,
} from './drizzle-stock-count-sessions';
import { recordEntry } from './stock-count-entry-writer';
import { postSession } from './stock-count-post-writer';

type DbOrTx = Transaction | DatabaseHandle;

/**
 * Postgres-backed `StockCountStore` (US12 / RFC 03 task 22). Thin delegate
 * over the sibling drizzle-stock-count-*.ts and stock-count-*-writer.ts
 * ops; create, entry and post run inside one transaction.
 */
export class DrizzleStockCountStore implements StockCountStore {
  constructor(private readonly db: DbOrTx) {}

  withTransaction(tx: DbOrTx): DrizzleStockCountStore {
    return new DrizzleStockCountStore(tx);
  }

  /** Open a transaction on the root handle; reuse it when already bound. */
  private inTx<T>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
    const handle = this.db as {
      transaction?: (fn: (tx: Transaction) => Promise<T>) => Promise<T>;
    };
    if (typeof handle.transaction === 'function') {
      return handle.transaction((tx) => fn(tx));
    }
    return fn(this.db);
  }

  countEligibleVariants(input: {
    workspaceId: string;
    warehouseId: string;
    variantIds: string[] | null;
  }) {
    return countEligibleVariants(this.db, input);
  }

  createSession(input: CreateStockCountSessionInput) {
    return this.inTx((tx) => createSession(tx, input));
  }

  findSession(workspaceId: string, sessionId: string) {
    return findSession(this.db, workspaceId, sessionId);
  }

  listSessions(input: ListStockCountSessionsInput) {
    return listSessions(this.db, input);
  }

  findActiveSession(
    workspaceId: string,
    warehouseId: string,
    options?: { freezingOnly?: boolean }
  ) {
    return findActiveSession(this.db, workspaceId, warehouseId, options);
  }

  listLines(workspaceId: string, sessionId: string) {
    return listLines(this.db, workspaceId, sessionId);
  }

  findLineByScan(workspaceId: string, sessionId: string, code: string) {
    return findLineByScan(this.db, workspaceId, sessionId, code);
  }

  listEntries(workspaceId: string, lineId: string) {
    return listEntries(this.db, workspaceId, lineId);
  }

  recordEntry(input: RecordStockCountEntryInput) {
    return this.inTx((tx) => recordEntry(tx, input));
  }

  updateLineReview(input: UpdateStockCountLineReviewInput) {
    return updateLineReview(this.db, input);
  }

  updateSession(input: UpdateStockCountSessionInput) {
    return updateSession(this.db, input);
  }

  postSession(input: PostStockCountSessionInput) {
    return this.inTx((tx) => postSession(tx, input));
  }
}
