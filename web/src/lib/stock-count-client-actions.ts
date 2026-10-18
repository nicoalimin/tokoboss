/**
 * Browser client for stock-opname entry / action / post Route Handlers
 * (US12 / RFC 03 task 40b). Shares the fetch helper and client-safe error
 * mapping from `stock-count-client.ts` (40a).
 */
import type {
  PostStockCountBody,
  RecordCountEntryBody,
  StockCountActionBody,
  StockCountEntryView,
  StockCountLineView,
  StockCountPostResultView,
} from '@tokoboss/contracts';
import {
  sid,
  stockCountCall,
  type FetchFn,
  type Session,
} from './stock-count-client';

/** POST one count entry; a clientEntryId replay returns `deduplicated`. */
export function recordCountEntry(
  ws: string,
  sessionId: string,
  body: RecordCountEntryBody,
  fetchFn: FetchFn = fetch
): Promise<{
  line: StockCountLineView;
  entry: StockCountEntryView;
  deduplicated: boolean;
}> {
  return stockCountCall(fetchFn, ws, `${sid(sessionId)}/entries`, body);
}

/** POST submit / return / cancel / freeze (CAS on expectedVersion). */
export function runStockCountAction(
  ws: string,
  sessionId: string,
  body: StockCountActionBody,
  fetchFn: FetchFn = fetch
): Promise<Session> {
  return stockCountCall(fetchFn, ws, `${sid(sessionId)}/actions`, body);
}

/** POST post (Manager/Admin); same idempotencyKey replays the result. */
export function postStockCount(
  ws: string,
  sessionId: string,
  body: PostStockCountBody,
  fetchFn: FetchFn = fetch
): Promise<StockCountPostResultView> {
  return stockCountCall(fetchFn, ws, `${sid(sessionId)}/post`, body);
}
