import {
  computeAllocatedTargetQty,
  computeDesiredLocationStocks,
  computeWarehouseSellableQty,
  type WarehouseInventorySnapshot,
} from '@tokoboss/domain';
import { describe, expect, it } from 'vitest';

/**
 * Outbound inventory sync calculator (UTA-37 / US04, RFC 06 task 3).
 * The domain package has no test runner, so the calculator is covered here.
 */
const wh = (
  warehouseId: string,
  onHandQty: number,
  extra: Partial<WarehouseInventorySnapshot> = {}
): WarehouseInventorySnapshot => ({
  warehouseId,
  warehouseStatus: 'active',
  onHandQty,
  ...extra,
});

describe('inventory sync calculator', () => {
  it('floors the allocation, subtracts the buffer and clamps negatives to 0', () => {
    expect(computeAllocatedTargetQty(7, 50, 1)).toBe(2);
    expect(computeAllocatedTargetQty(3, 100, 5)).toBe(0);
    expect(computeWarehouseSellableQty(wh('w1', -2))).toBe(0);
    expect(computeWarehouseSellableQty(wh('w1', 10, { reservedQty: 4 }))).toBe(
      6
    );
    expect(
      computeDesiredLocationStocks({
        provider: 'shopee',
        warehouses: [wh('w1', -2)],
        locationLinks: [],
        stockBuffer: 5,
        allocationPct: 100,
      })
    ).toEqual({
      status: 'ok',
      mode: 'all_active_warehouses',
      sellableTotal: 0,
      desiredQty: 0,
      targets: [
        {
          externalLocationId: null,
          warehouseId: null,
          sellableQty: 0,
          quantity: 0,
        },
      ],
    });
  });

  it('uses linked active warehouses or falls back to all active warehouses', () => {
    const warehouses = [
      wh('w1', 10),
      wh('w2', 6),
      wh('w3', 50, { warehouseStatus: 'deactivated' }),
    ];
    const linked = computeDesiredLocationStocks({
      provider: 'shopee',
      warehouses,
      locationLinks: [
        { externalLocationId: 'loc-a', warehouseId: 'w1' },
        { externalLocationId: 'loc-b', warehouseId: 'w3' },
      ],
      stockBuffer: 1,
      allocationPct: 50,
    });
    expect(linked).toEqual({
      status: 'ok',
      mode: 'linked_warehouses',
      sellableTotal: 16,
      desiredQty: 4,
      targets: [
        {
          externalLocationId: 'loc-a',
          warehouseId: 'w1',
          sellableQty: 10,
          quantity: 4,
        },
      ],
    });
    const fallback = computeDesiredLocationStocks({
      provider: 'blibli',
      warehouses,
      locationLinks: [],
      stockBuffer: 2,
      allocationPct: 100,
    });
    expect(fallback.status).toBe('ok');
    expect(fallback.sellableTotal).toBe(16);
    expect(fallback.desiredQty).toBe(14);
  });

  it('reports location_unlinked when no linked active warehouse exists', () => {
    const unlinked = {
      status: 'location_unlinked',
      sellableTotal: 8,
      desiredQty: 0,
      targets: [],
    };
    expect(
      computeDesiredLocationStocks({
        provider: 'tiktok_shop',
        warehouses: [wh('w1', 8)],
        locationLinks: [],
        stockBuffer: 0,
        allocationPct: 100,
      })
    ).toEqual(unlinked);
    expect(
      computeDesiredLocationStocks({
        provider: 'shopee',
        warehouses: [
          wh('w1', 8),
          wh('w2', 0, { warehouseStatus: 'deactivated' }),
        ],
        locationLinks: [
          { externalLocationId: 'loc-a', warehouseId: null },
          { externalLocationId: 'loc-b', warehouseId: 'w2' },
        ],
        stockBuffer: 0,
        allocationPct: 100,
      })
    ).toEqual(unlinked);
  });
});
