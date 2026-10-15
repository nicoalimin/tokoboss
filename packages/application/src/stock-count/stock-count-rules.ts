/**
 * Pure stock-opname rules (US12 / RFC 03 task 4). I/O-free.
 * D1: variance = counted - system qty at count; movement during count =
 * system qty at count - snapshot. Uncounted (null) never becomes zero.
 * D3: ledger reason adj_opname_in / adj_opname_out by variance sign.
 * D4: flag (never block) a large negative variance, an explicit zero, or a
 * live balance that would go below 0. Also add/replace entry merging and
 * the session state machine (counting -> submitted -> posted; return; cancel).
 */

export const FLAG_NEGATIVE_RATIO = 0.5;
export const MAX_ENTRY_QTY = 1_000_000;
export const MAX_SESSION_LINES = 2000;

export type StockCountStatus =
  'counting' | 'submitted' | 'posted' | 'cancelled';
export type StockCountEntryMode = 'add' | 'replace';
export type StockCountAction = 'submit' | 'return' | 'cancel' | 'post';
export type StockCountLedgerReason = 'adj_opname_in' | 'adj_opname_out';
export type StockCountFlagReason =
  'large_negative' | 'explicit_zero' | 'negative_result';

export interface StockCountLineQty {
  countedQty: number | null;
  systemQtyAtCount: number | null;
}

/** Variance for a counted line; null when the line is uncounted. */
export function computeVariance(line: StockCountLineQty): number | null {
  if (line.countedQty === null || line.systemQtyAtCount === null) return null;
  return line.countedQty - line.systemQtyAtCount;
}

/** Movement during count (for uncounted lines pass the live qty). */
export function computeMovement(
  snapshotQty: number,
  systemQty: number
): number {
  return systemQty - snapshotQty;
}

/** Ledger reason for a variance; null when nothing posts (uncounted or 0). */
export function ledgerReasonFor(
  variance: number | null
): StockCountLedgerReason | null {
  if (variance === null || variance === 0) return null;
  return variance > 0 ? 'adj_opname_in' : 'adj_opname_out';
}

/** D4 flags. liveQty is the live balance the variance will be applied to. */
export function flagReasons(
  line: StockCountLineQty,
  liveQty: number
): StockCountFlagReason[] {
  const variance = computeVariance(line);
  if (variance === null) return [];
  const system = line.systemQtyAtCount ?? 0;
  const out: StockCountFlagReason[] = [];
  if (variance < 0 && system > 0 && -variance >= system * FLAG_NEGATIVE_RATIO) {
    out.push('large_negative');
  }
  if (line.countedQty === 0 && system > 0) out.push('explicit_zero');
  if (liveQty + variance < 0) out.push('negative_result');
  return out;
}

/** True when an entry qty is an integer in 0..MAX_ENTRY_QTY. */
export function isValidEntryQty(qty: number): boolean {
  return Number.isInteger(qty) && qty >= 0 && qty <= MAX_ENTRY_QTY;
}

/** add: (counted ?? 0) + qty; replace: qty (a recount). */
export function mergeEntry(
  countedQty: number | null,
  qty: number,
  mode: StockCountEntryMode
): number {
  return mode === 'add' ? (countedQty ?? 0) + qty : qty;
}

const TRANSITIONS: Record<
  StockCountAction,
  { from: readonly StockCountStatus[]; to: StockCountStatus }
> = {
  submit: { from: ['counting'], to: 'submitted' },
  return: { from: ['submitted'], to: 'counting' },
  cancel: { from: ['counting', 'submitted'], to: 'cancelled' },
  post: { from: ['submitted'], to: 'posted' },
};

/** Next status, or null when the action is not allowed from `status`. */
export function nextStatus(
  status: StockCountStatus,
  action: StockCountAction
): StockCountStatus | null {
  const rule = TRANSITIONS[action];
  return rule.from.includes(status) ? rule.to : null;
}

/** posted and cancelled are terminal; their lines are closed. */
export function isTerminalStatus(status: StockCountStatus): boolean {
  return status === 'posted' || status === 'cancelled';
}
