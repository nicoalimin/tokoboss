import type { TenancyAuditSink } from '../tenancy/tenancy-ports';
import type { WorkspaceContext } from '../tenancy/tenancy-types';
import { assertSameWorkspace } from '../tenancy/workspace-context';
import { stockCountNotFound, stockCountValidation } from './stock-count-errors';
import type { StockCountStore } from './stock-count-ports';
import {
  nextStatus,
  type StockCountAction,
  type StockCountStatus,
} from './stock-count-rules';
import type { StockCountSessionRecord } from './stock-count-types';

/**
 * Shared helpers for session transitions (US12 / RFC 03 task 13a).
 * Scope first (unknown/out-of-scope session = STOCK_COUNT_NOT_FOUND), then
 * the caller's role gate (403), then the state machine (validation).
 * Used by stock-count-transitions.ts (submit/return, 13b) and
 * stock-count-cancel-freeze.ts (cancel/freeze, 13c).
 */
export interface StockCountTransitionDeps {
  store: StockCountStore;
  audit: Pick<TenancyAuditSink, 'append'>;
}

export interface StockCountTransitionInput {
  ctx: WorkspaceContext;
  workspaceId: string;
  sessionId: string;
  expectedVersion: number;
  note?: string | null;
  now: Date;
}

/** Same-workspace + warehouse-scope load; misses are a neutral 404. */
export async function loadScopedSession(
  store: StockCountStore,
  ctx: WorkspaceContext,
  workspaceId: string,
  sessionId: string
): Promise<StockCountSessionRecord> {
  assertSameWorkspace(ctx, workspaceId);
  const session = await store.findSession(workspaceId, sessionId);
  const inScope =
    ctx.role === 'admin' ||
    ctx.warehouseScope === null ||
    ctx.warehouseScope === session?.warehouseId;
  if (!session || !inScope) throw stockCountNotFound();
  return session;
}

/** Status the action needs; throws a validation error when not allowed. */
export function requireTransition(
  session: StockCountSessionRecord,
  action: StockCountAction
): StockCountStatus {
  const from = session.status as StockCountStatus;
  if (nextStatus(from, action) === null) {
    throw stockCountValidation('Status sesi tidak mengizinkan tindakan ini.');
  }
  return from;
}

/** Trimmed note (max 500); null when blank. */
export function cleanNote(note: string | null | undefined): string | null {
  const text = (note ?? '').trim();
  if (text.length > 500)
    throw stockCountValidation('Catatan maks. 500 karakter.');
  return text.length === 0 ? null : text;
}
