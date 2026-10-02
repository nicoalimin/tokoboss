import { describe, expect, it } from 'vitest';
import type { ProductView, WarehouseView } from '../lib/catalog-client';
import {
  productHasWarehouseLevel,
  productQtyForWarehouse,
  summarizeWarehouseQtys,
} from '../lib/product-warehouse-filter';

function productWithLevels(
  levelsByVariant: Array<Array<{ warehouseId: string; qty: number }>>
): ProductView {
  return {
    id: 'prod_1',
    workspaceId: 'ws_1',
    name: 'Kaos',
    description: null,
    unit: 'pcs',
    pictures: [],
    status: 'active',
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    variants: levelsByVariant.map((levels, i) => ({
      id: `var_${i + 1}`,
      workspaceId: 'ws_1',
      productId: 'prod_1',
      skuCode: `SKU-${i + 1}`,
      name: null,
      barcode: null,
      sellingPriceCents: 1000,
      currency: 'IDR',
      hppCents: null,
      costSource: null,
      listingName: null,
      status: 'active' as const,
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      levels: levels.map((l) => ({
        variantId: `var_${i + 1}`,
        warehouseId: l.warehouseId,
        qty: l.qty,
        version: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
      })),
    })),
  };
}

function warehouse(
  id: string,
  name: string,
  code: string,
  status: 'active' | 'deactivated' = 'active'
): WarehouseView {
  return {
    id,
    workspaceId: 'ws_1',
    name,
    code,
    status,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('product-warehouse-filter (UTA-143)', () => {
  it('productHasWarehouseLevel is true when a level row exists even at qty 0', () => {
    const p = productWithLevels([[{ warehouseId: 'wh_a', qty: 0 }]]);
    expect(productHasWarehouseLevel(p, 'wh_a')).toBe(true);
    expect(productHasWarehouseLevel(p, 'wh_b')).toBe(false);
  });

  it('productQtyForWarehouse sums matching warehouse levels across variants', () => {
    const p = productWithLevels([
      [
        { warehouseId: 'wh_a', qty: 3 },
        { warehouseId: 'wh_b', qty: 9 },
      ],
      [{ warehouseId: 'wh_a', qty: 2 }],
    ]);
    expect(productQtyForWarehouse(p, 'wh_a')).toBe(5);
    expect(productQtyForWarehouse(p, 'wh_b')).toBe(9);
    expect(productQtyForWarehouse(p, 'wh_missing')).toBe(0);
  });

  it('summarizeWarehouseQtys aggregates qty per warehouse across products', () => {
    const products: ProductView[] = [
      productWithLevels([
        [
          { warehouseId: 'wh_a', qty: 10 },
          { warehouseId: 'wh_b', qty: 5 },
        ],
      ]),
      productWithLevels([[{ warehouseId: 'wh_a', qty: 3 }]]),
    ];
    const warehouses: WarehouseView[] = [
      warehouse('wh_a', 'Main WH', 'MAIN'),
      warehouse('wh_b', 'Secondary WH', 'SEC'),
    ];
    const summary = summarizeWarehouseQtys(products, warehouses);
    expect(summary).toEqual([
      { warehouseId: 'wh_a', name: 'Main WH', code: 'MAIN', totalQty: 13 },
      { warehouseId: 'wh_b', name: 'Secondary WH', code: 'SEC', totalQty: 5 },
    ]);
  });

  it('summarizeWarehouseQtys shows 0 for warehouses with no product levels', () => {
    const products: ProductView[] = [
      productWithLevels([[{ warehouseId: 'wh_a', qty: 2 }]]),
    ];
    const warehouses: WarehouseView[] = [
      warehouse('wh_a', 'Main WH', 'MAIN'),
      warehouse('wh_b', 'Empty WH', 'EMP'),
    ];
    const summary = summarizeWarehouseQtys(products, warehouses);
    expect(summary[1]!.totalQty).toBe(0);
  });

  it('summarizeWarehouseQtys preserves warehouse ordering', () => {
    const products: ProductView[] = [];
    const warehouses: WarehouseView[] = [
      warehouse('wh_c', 'C', 'C'),
      warehouse('wh_a', 'A', 'A'),
    ];
    const summary = summarizeWarehouseQtys(products, warehouses);
    expect(summary.map((s) => s.warehouseId)).toEqual(['wh_c', 'wh_a']);
  });
});
