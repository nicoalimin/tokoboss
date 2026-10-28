import type { MarketplaceProvider } from './marketplace-connection';

/**
 * Outbound inventory sync domain vocabulary & sellable-stock calculator
 * (UTA-37 / US04, RFC 06 task 1). Pure domain logic with zero I/O.
 */
export const INVENTORY_SYNC_STATUSES = [
  'off',
  'syncing',
  'synced',
  'needs_attention',
] as const;
export type InventorySyncStatus = (typeof INVENTORY_SYNC_STATUSES)[number];

export interface WarehouseInventorySnapshot {
  readonly warehouseId: string;
  readonly warehouseStatus: 'active' | 'deactivated';
  readonly onHandQty: number;
  readonly reservedQty?: number;
}

export interface StoreLocationLinkSnapshot {
  readonly externalLocationId: string;
  readonly warehouseId: string | null;
}

export interface DesiredLocationStockTarget {
  readonly externalLocationId: string | null;
  readonly warehouseId: string | null;
  readonly sellableQty: number;
  readonly quantity: number;
}

export interface ComputeDesiredLocationStocksInput {
  readonly provider: MarketplaceProvider;
  readonly warehouses: readonly WarehouseInventorySnapshot[];
  readonly locationLinks: readonly StoreLocationLinkSnapshot[];
  readonly stockBuffer: number;
  readonly allocationPct: number;
}

export type ComputeDesiredLocationStocksResult =
  | {
      readonly status: 'ok';
      readonly mode: 'linked_warehouses' | 'all_active_warehouses';
      readonly sellableTotal: number;
      readonly desiredQty: number;
      readonly targets: readonly DesiredLocationStockTarget[];
    }
  | {
      readonly status: 'location_unlinked';
      readonly sellableTotal: number;
      readonly desiredQty: 0;
      readonly targets: readonly [];
    };

/** Clamps negative on-hand or reserved stock; deactivated warehouses give 0. */
export function computeWarehouseSellableQty(
  w: WarehouseInventorySnapshot
): number {
  if (w.warehouseStatus !== 'active') return 0;
  const reserved = Math.max(0, Math.trunc(w.reservedQty ?? 0));
  return Math.max(0, Math.trunc(w.onHandQty) - reserved);
}

/** Applies allocation % floor then subtracts safety buffer, clamped at >= 0. */
export function computeAllocatedTargetQty(
  sellableQty: number,
  allocationPct: number,
  stockBuffer: number
): number {
  const safe = Math.max(0, Math.trunc(sellableQty));
  const pct = Math.min(100, Math.max(1, Math.trunc(allocationPct)));
  const buf = Math.max(0, Math.trunc(stockBuffer));
  return Math.max(0, Math.floor((safe * pct) / 100) - buf);
}

export function computeDesiredLocationStocks(
  input: ComputeDesiredLocationStocksInput
): ComputeDesiredLocationStocksResult {
  const activeByWh = new Map<string, number>();
  let sellableTotal = 0;
  for (const w of input.warehouses) {
    if (w.warehouseStatus === 'active') {
      const qty = computeWarehouseSellableQty(w);
      activeByWh.set(w.warehouseId, qty);
      sellableTotal += qty;
    }
  }
  const validLinks = input.locationLinks.filter(
    (l) => l.warehouseId !== null && activeByWh.has(l.warehouseId)
  );
  if (validLinks.length > 0) {
    const targets = validLinks.map((l) => {
      const sellableQty = activeByWh.get(l.warehouseId!) ?? 0;
      const quantity = computeAllocatedTargetQty(
        sellableQty,
        input.allocationPct,
        input.stockBuffer
      );
      return {
        externalLocationId: l.externalLocationId,
        warehouseId: l.warehouseId,
        sellableQty,
        quantity,
      };
    });
    const desiredQty = targets.reduce((sum, t) => sum + t.quantity, 0);
    return {
      status: 'ok',
      mode: 'linked_warehouses',
      sellableTotal,
      desiredQty,
      targets,
    };
  }
  if (input.locationLinks.length > 0 || input.provider === 'tiktok_shop') {
    return {
      status: 'location_unlinked',
      sellableTotal,
      desiredQty: 0,
      targets: [],
    };
  }
  const desiredQty = computeAllocatedTargetQty(
    sellableTotal,
    input.allocationPct,
    input.stockBuffer
  );
  return {
    status: 'ok',
    mode: 'all_active_warehouses',
    sellableTotal,
    desiredQty,
    targets: [
      {
        externalLocationId: null,
        warehouseId: null,
        sellableQty: sellableTotal,
        quantity: desiredQty,
      },
    ],
  };
}
