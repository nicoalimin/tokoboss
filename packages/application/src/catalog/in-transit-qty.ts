/**
 * In-transit quantity per variant (UTA-146 Slice 1e-iii / Story 11).
 * Pure, I/O-free: caller supplies transfers (with items) for ONE workspace.
 * Only transfers with status 'sent' count: send already removed the units
 * from the source warehouse level and receive has not added them yet.
 * Per item, in-transit = sentQty - receivedQty - damagedQty, floored at 0.
 */

import type { TransferWithItems } from './catalog-types';

export function sumInTransitQtyByVariant(
  transfers: readonly TransferWithItems[]
): Map<string, number> {
  const out = new Map<string, number>();
  for (const { transfer, items } of transfers) {
    if (transfer.status !== 'sent') continue;
    for (const item of items) {
      const pending = item.sentQty - item.receivedQty - item.damagedQty;
      if (pending <= 0) continue;
      out.set(item.variantId, (out.get(item.variantId) ?? 0) + pending);
    }
  }
  return out;
}
