import { describe, expect, it } from 'vitest';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import { InMemoryCatalogStore } from '../in-memory-catalog-store';
import {
  adjustStock,
  archiveVariant,
  createProduct,
  createWarehouse,
  updateVariantReplenishSettings,
} from '../catalog-use-cases';
import { listLowStockRecommendations } from '../list-low-stock-recommendations';

function admin(workspaceId: string): WorkspaceContext {
  return {
    workspaceId,
    userId: 'user_admin_1',
    role: 'admin',
    warehouseScope: null,
    status: 'active',
    authVersion: 1,
  };
}

const WS = 'ws_list_low_stock_recs_1';

describe('listLowStockRecommendations (Story 11 / UTA-146)', () => {
  it('returns only active variants with minStock set and available strictly below min, sorted by skuCode', async () => {
    const store = new InMemoryCatalogStore();
    const ctx = admin(WS);
    const warehouse = await createWarehouse(store, {
      ctx,
      workspaceId: WS,
      code: 'JKT-LSR',
      name: 'Jakarta LSR',
    });

    const lowA = await createProduct(store, {
      ctx,
      workspaceId: WS,
      name: 'Product A',
      unit: 'pcs',
      variants: [
        {
          skuCode: 'SKU-B-LOW',
          name: 'B',
          sellingPriceCents: 10000,
          hppCents: 4000,
          costSource: 'manual',
        },
      ],
    });
    const lowB = await createProduct(store, {
      ctx,
      workspaceId: WS,
      name: 'Product B',
      unit: 'pcs',
      variants: [
        {
          skuCode: 'SKU-A-LOW',
          name: 'A',
          sellingPriceCents: 10000,
          hppCents: null,
          costSource: null,
        },
      ],
    });
    const okStock = await createProduct(store, {
      ctx,
      workspaceId: WS,
      name: 'Product OK',
      unit: 'pcs',
      variants: [
        {
          skuCode: 'SKU-OK',
          name: 'OK',
          sellingPriceCents: 10000,
          hppCents: 4000,
          costSource: 'manual',
        },
      ],
    });
    await createProduct(store, {
      ctx,
      workspaceId: WS,
      name: 'Product NoMin',
      unit: 'pcs',
      variants: [
        {
          skuCode: 'SKU-NOMIN',
          name: 'NoMin',
          sellingPriceCents: 10000,
          hppCents: 4000,
          costSource: 'manual',
        },
      ],
    });
    const archived = await createProduct(store, {
      ctx,
      workspaceId: WS,
      name: 'Product Arch',
      unit: 'pcs',
      variants: [
        {
          skuCode: 'SKU-ARCH',
          name: 'Arch',
          sellingPriceCents: 10000,
          hppCents: 4000,
          costSource: 'manual',
        },
      ],
    });

    const vLowA = lowA.variants[0]!;
    const vLowB = lowB.variants[0]!;
    const vOk = okStock.variants[0]!;
    const vArch = archived.variants[0]!;

    await updateVariantReplenishSettings(store, {
      ctx,
      workspaceId: WS,
      variantId: vLowA.id,
      minStockQty: 10,
      leadTimeDays: 3,
      expectedVersion: vLowA.version,
    });
    await updateVariantReplenishSettings(store, {
      ctx,
      workspaceId: WS,
      variantId: vLowB.id,
      minStockQty: 10,
      leadTimeDays: null,
      expectedVersion: vLowB.version,
    });
    await updateVariantReplenishSettings(store, {
      ctx,
      workspaceId: WS,
      variantId: vOk.id,
      minStockQty: 10,
      leadTimeDays: null,
      expectedVersion: vOk.version,
    });
    await updateVariantReplenishSettings(store, {
      ctx,
      workspaceId: WS,
      variantId: vArch.id,
      minStockQty: 10,
      leadTimeDays: null,
      expectedVersion: vArch.version,
    });

    await adjustStock(store, {
      ctx,
      workspaceId: WS,
      variantId: vLowA.id,
      warehouseId: warehouse.id,
      delta: 2,
      reason: 'seed low A',
    });
    await adjustStock(store, {
      ctx,
      workspaceId: WS,
      variantId: vLowB.id,
      warehouseId: warehouse.id,
      delta: 1,
      reason: 'seed low B',
    });
    await adjustStock(store, {
      ctx,
      workspaceId: WS,
      variantId: vOk.id,
      warehouseId: warehouse.id,
      delta: 10,
      reason: 'seed ok',
    });
    await adjustStock(store, {
      ctx,
      workspaceId: WS,
      variantId: vArch.id,
      warehouseId: warehouse.id,
      delta: 1,
      reason: 'seed arch',
    });

    await archiveVariant(store, {
      ctx,
      workspaceId: WS,
      variantId: vArch.id,
    });

    const rows = await listLowStockRecommendations(store, {
      ctx,
      workspaceId: WS,
    });

    expect(rows.map((r) => r.skuCode)).toEqual(['SKU-A-LOW', 'SKU-B-LOW']);
    expect(rows.some((r) => r.skuCode === 'SKU-OK')).toBe(false);
    expect(rows.some((r) => r.skuCode === 'SKU-NOMIN')).toBe(false);
    expect(rows.some((r) => r.skuCode === 'SKU-ARCH')).toBe(false);

    const a = rows[0]!;
    expect(a.availableQty).toBe(1);
    expect(a.minStockQty).toBe(10);
    expect(a.salesRatePerDay).toBeNull();
    expect(a.missingSupplier).toBe(true);
    expect(a.missingHpp).toBe(true);
    expect(a.suggestedReorderQty).toBe(9);

    const b = rows[1]!;
    expect(b.availableQty).toBe(2);
    expect(b.missingHpp).toBe(false);
    expect(b.leadTimeDays).toBe(3);
  });
});
