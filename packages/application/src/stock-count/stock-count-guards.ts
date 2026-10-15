import { stockCountActive, stockCountFreeze } from './stock-count-errors';
import type { StockCountStore } from './stock-count-ports';

/**
 * Warehouse guards for stock opname (US12 / RFC 03 task 19).
 *
 * Called by web routes before acting, not inside the catalog transaction,
 * so the RFC 03 D2 check-then-act gap applies (accepted: D1 still gives
 * the correct variance).
 *
 * - `assertNoOpenCount`: warehouse deactivate (US06) is blocked while the
 *   warehouse has any `counting` or `submitted` session →
 *   409 `STOCK_COUNT_ACTIVE`.
 * - `assertNoOutboundFreeze`: sending a transfer FROM the warehouse is
 *   blocked while an open session has `freezeOutboundTransfers` on →
 *   409 `STOCK_COUNT_FREEZE`. Receipts, adjustments and sales are not
 *   frozen.
 */
export type StockCountGuardStore = Pick<StockCountStore, 'findActiveSession'>;

export interface AssertNoOpenCountInput {
  workspaceId: string;
  warehouseId: string;
  /** Live warehouse name, used in the client-safe 409 message. */
  warehouseName: string;
}

export async function assertNoOpenCount(
  store: StockCountGuardStore,
  input: AssertNoOpenCountInput
): Promise<void> {
  const active = await store.findActiveSession(
    input.workspaceId,
    input.warehouseId
  );
  if (active) throw stockCountActive(input.warehouseName, active.code);
}

export interface AssertNoOutboundFreezeInput {
  workspaceId: string;
  /** The transfer's source warehouse. */
  warehouseId: string;
}

export async function assertNoOutboundFreeze(
  store: StockCountGuardStore,
  input: AssertNoOutboundFreezeInput
): Promise<void> {
  const freezing = await store.findActiveSession(
    input.workspaceId,
    input.warehouseId,
    { freezingOnly: true }
  );
  if (freezing) throw stockCountFreeze();
}
