import { and, eq, inArray } from 'drizzle-orm';
import type { DatabaseHandle, Transaction } from '../db';
import {
  catalogInventoryLevels,
  catalogWarehouses,
  marketplaceLocationLinks,
} from '../schema/index';

/**
 * Overview stock totals for the Drizzle SKU mapping read store (UTA-40 /
 * US03, RFC 05 task 22c). totalStockQty sums on-hand over the variant's
 * active warehouses; linkedStockQtyByConnection sums only the active
 * warehouses a store links via marketplace_location_links (each
 * warehouse once per store). A store key is present (maybe 0) only when
 * it links an active warehouse; computeStockConflict keys on that.
 */

type DbOrTx = Transaction | DatabaseHandle;

export interface SkuMappingVariantStock {
  totalStockQty: number;
  linkedStockQtyByConnection: Record<string, number>;
}

export async function loadSkuMappingVariantStock(
  db: DbOrTx,
  workspaceId: string,
  variantIds: string[]
): Promise<Map<string, SkuMappingVariantStock>> {
  const out = new Map<string, SkuMappingVariantStock>();
  for (const id of variantIds) {
    out.set(id, { totalStockQty: 0, linkedStockQtyByConnection: {} });
  }
  if (variantIds.length === 0) return out;
  const lvl = catalogInventoryLevels;
  const wh = catalogWarehouses;
  const ll = marketplaceLocationLinks;
  type Level = { variantId: string; warehouseId: string; qty: number };
  type Link = { connectionId: string; warehouseId: string };
  const [levels, links]: [Level[], Link[]] = await Promise.all([
    db
      .select({
        variantId: lvl.variantId,
        warehouseId: lvl.warehouseId,
        qty: lvl.qty,
      })
      .from(lvl)
      .innerJoin(wh, eq(wh.id, lvl.warehouseId))
      .where(
        and(
          eq(lvl.workspaceId, workspaceId),
          eq(wh.status, 'active'),
          inArray(lvl.variantId, variantIds)
        )
      ),
    db
      .select({ connectionId: ll.connectionId, warehouseId: wh.id })
      .from(ll)
      .innerJoin(wh, eq(wh.id, ll.warehouseId))
      .where(and(eq(ll.workspaceId, workspaceId), eq(wh.status, 'active'))),
  ]);
  const linked = new Map<string, Set<string>>();
  for (const { connectionId, warehouseId } of links) {
    const set = linked.get(connectionId) ?? new Set<string>();
    linked.set(connectionId, set.add(warehouseId));
  }
  for (const stock of out.values()) {
    for (const id of linked.keys()) stock.linkedStockQtyByConnection[id] = 0;
  }
  for (const level of levels) {
    const stock = out.get(level.variantId);
    if (!stock) continue;
    stock.totalStockQty += level.qty;
    for (const [connectionId, warehouses] of linked) {
      if (!warehouses.has(level.warehouseId)) continue;
      const byConn = stock.linkedStockQtyByConnection;
      byConn[connectionId] = (byConn[connectionId] ?? 0) + level.qty;
    }
  }
  return out;
}
