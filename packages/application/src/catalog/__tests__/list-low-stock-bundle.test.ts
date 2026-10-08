import { describe, expect, it } from 'vitest';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import { archiveBundle, createBundle } from '../../bundles/bundle-use-cases';
import { InMemoryCatalogStore } from '../in-memory-catalog-store';
import {
  adjustStock,
  createProduct,
  createWarehouse,
  updateVariantReplenishSettings,
} from '../catalog-use-cases';
import { listLowStockRecommendations } from '../list-low-stock-recommendations';

const WS = 'ws_list_low_stock_bundle_1';

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

/**
 * A component SKU (min 10, 2 on hand) and a bundle SKU (min 5, no direct
 * stock) whose BOM is 2x the component.
 */
async function seedBundle(): Promise<{
  store: InMemoryCatalogStore;
  ctx: WorkspaceContext;
  componentId: string;
  bundleId: string;
  bundleVersion: number;
}> {
  const store = new InMemoryCatalogStore();
  const ctx = admin(WS);
  const warehouse = await createWarehouse(store, {
    ctx,
    workspaceId: WS,
    code: 'JKT-LSB',
    name: 'Jakarta LSB',
  });
  const product = await createProduct(store, {
    ctx,
    workspaceId: WS,
    name: 'Product BD',
    unit: 'pcs',
    variants: [
      {
        skuCode: 'SKU-BD-COMP',
        name: 'Component',
        sellingPriceCents: 10000,
        hppCents: 4000,
        costSource: 'manual',
      },
      {
        skuCode: 'SKU-BD-PACK',
        name: 'Pack of 2',
        sellingPriceCents: 18000,
        hppCents: 8000,
        costSource: 'manual',
      },
    ],
  });
  const component = product.variants[0]!;
  const pack = product.variants[1]!;
  await updateVariantReplenishSettings(store, {
    ctx,
    workspaceId: WS,
    variantId: component.id,
    minStockQty: 10,
    leadTimeDays: null,
    expectedVersion: component.version,
  });
  const packWithMin = await updateVariantReplenishSettings(store, {
    ctx,
    workspaceId: WS,
    variantId: pack.id,
    minStockQty: 5,
    leadTimeDays: null,
    expectedVersion: pack.version,
  });
  const detail = await createBundle(store, {
    ctx,
    workspaceId: WS,
    bundleVariantId: pack.id,
    components: [{ componentVariantId: component.id, qty: 2 }],
    expectedVersion: packWithMin.version,
  });
  await adjustStock(store, {
    ctx,
    workspaceId: WS,
    variantId: component.id,
    warehouseId: warehouse.id,
    delta: 2,
    reason: 'seed low bundle',
  });
  return {
    store,
    ctx,
    componentId: component.id,
    bundleId: pack.id,
    bundleVersion: detail.bundle.version,
  };
}

describe('listLowStockRecommendations bundle skip (UTA-146 slice 1h-i)', () => {
  it('leaves the bundle out and still recommends its below-min component', async () => {
    const { store, ctx, componentId, bundleId } = await seedBundle();

    const rows = await listLowStockRecommendations(store, {
      ctx,
      workspaceId: WS,
    });

    expect(rows.map((r) => r.variantId)).toEqual([componentId]);
    expect(rows.some((r) => r.variantId === bundleId)).toBe(false);
    expect(rows[0]!.skuCode).toBe('SKU-BD-COMP');
    expect(rows[0]!.availableQty).toBe(2);
    expect(rows[0]!.suggestedReorderQty).toBe(8);
  });

  it('lists the variant again once its BOM is cleared', async () => {
    const { store, ctx, bundleId, bundleVersion } = await seedBundle();
    await archiveBundle(store, {
      ctx,
      workspaceId: WS,
      bundleVariantId: bundleId,
      expectedVersion: bundleVersion,
    });

    const rows = await listLowStockRecommendations(store, {
      ctx,
      workspaceId: WS,
    });

    expect(rows.map((r) => r.skuCode)).toEqual(['SKU-BD-COMP', 'SKU-BD-PACK']);
    const pack = rows.find((r) => r.variantId === bundleId)!;
    expect(pack.availableQty).toBe(0);
    expect(pack.suggestedReorderQty).toBe(5);
  });
});
