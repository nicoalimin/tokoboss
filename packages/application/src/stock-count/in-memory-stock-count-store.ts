import type {
  CreateStockCountSessionInput,
  ListStockCountSessionsInput,
  PostStockCountSessionInput,
  RecordStockCountEntryInput,
  UpdateStockCountLineReviewInput,
  UpdateStockCountSessionInput,
} from './stock-count-port-inputs';
import type { StockCountStore } from './stock-count-ports';
import {
  countEligibleVariants,
  createSession,
} from './in-memory-stock-count-create';
import { recordEntry } from './in-memory-stock-count-entries';
import {
  findLineByScan,
  listEntries,
  listLines,
  updateLineReview,
} from './in-memory-stock-count-lines';
import { postSession } from './in-memory-stock-count-post';
import {
  findActiveSession,
  findSession,
  listSessions,
  updateSession,
} from './in-memory-stock-count-sessions';
import {
  newStockCountMemory,
  type StockCountCatalog,
  type StockCountMemory,
} from './in-memory-stock-count-state';

/**
 * In-memory `StockCountStore` (US12 / RFC 03 task 8d-ii) for unit tests
 * and memory-mode web wiring. Thin delegate over the sibling
 * in-memory-stock-count-*.ts ops, all sharing one StockCountMemory.
 */
export class InMemoryStockCountStore implements StockCountStore {
  private readonly mem: StockCountMemory;

  constructor(catalog: StockCountCatalog) {
    this.mem = newStockCountMemory(catalog);
  }

  countEligibleVariants(input: {
    workspaceId: string;
    warehouseId: string;
    variantIds: string[] | null;
  }) {
    return countEligibleVariants(this.mem, input);
  }

  createSession(input: CreateStockCountSessionInput) {
    return createSession(this.mem, input);
  }

  findSession(workspaceId: string, sessionId: string) {
    return findSession(this.mem, workspaceId, sessionId);
  }

  listSessions(input: ListStockCountSessionsInput) {
    return listSessions(this.mem, input);
  }

  findActiveSession(
    workspaceId: string,
    warehouseId: string,
    options?: { freezingOnly?: boolean }
  ) {
    return findActiveSession(this.mem, workspaceId, warehouseId, options);
  }

  listLines(workspaceId: string, sessionId: string) {
    return listLines(this.mem, workspaceId, sessionId);
  }

  findLineByScan(workspaceId: string, sessionId: string, code: string) {
    return findLineByScan(this.mem, workspaceId, sessionId, code);
  }

  listEntries(workspaceId: string, lineId: string) {
    return listEntries(this.mem, workspaceId, lineId);
  }

  recordEntry(input: RecordStockCountEntryInput) {
    return recordEntry(this.mem, input);
  }

  updateLineReview(input: UpdateStockCountLineReviewInput) {
    return updateLineReview(this.mem, input);
  }

  updateSession(input: UpdateStockCountSessionInput) {
    return updateSession(this.mem, input);
  }

  postSession(input: PostStockCountSessionInput) {
    return postSession(this.mem, input);
  }
}
