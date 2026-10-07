import { describe, expect, it } from 'vitest';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import { InMemoryCatalogStore } from '../in-memory-catalog-store';
import {
  bulkUpdateVariantReplenishSettings,
  createProduct,
  updateVariantReplenishSettings,
} from '../catalog-use-cases';

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

const WS = 'ws_replenish_settings_max_stock_1';

async function createVariant(store: InMemoryCatalogStore, skuCode: string) {
  const created = await createProduct(store, {
    ctx: admin(WS),
    workspaceId: WS,
    name: 'Kaos Polos',
    unit: 'pcs',
    variants: [
      {
        skuCode,
        name: 'Merah / M',
        sellingPriceCents: 99000,
        hppCents: 45000,
        costSource: 'manual',
      },
    ],
  });
  return created.variants[0]!;
}

describe('updateVariantReplenishSettings maxStockQty (Story 11 / UTA-146)', () => {
  it('accepts a maxStockQty-only update and leaves min/lead unchanged', async () => {
    const store = new InMemoryCatalogStore();
    const variant = await createVariant(store, 'TSHIRT-REPLN-MAX-1');

    const updated = await updateVariantReplenishSettings(store, {
      ctx: admin(WS),
      workspaceId: WS,
      variantId: variant.id,
      maxStockQty: 50,
      expectedVersion: variant.version,
    });

    expect(updated.maxStockQty).toBe(50);
    expect(updated.minStockQty).toBe(variant.minStockQty);
    expect(updated.leadTimeDays).toBe(variant.leadTimeDays);

    const readBack = await store.findVariantById(WS, variant.id);
    expect(readBack?.maxStockQty).toBe(50);
  });

  it('clears maxStockQty when null is passed', async () => {
    const store = new InMemoryCatalogStore();
    const variant = await createVariant(store, 'TSHIRT-REPLN-MAX-2');

    const withCap = await updateVariantReplenishSettings(store, {
      ctx: admin(WS),
      workspaceId: WS,
      variantId: variant.id,
      maxStockQty: 40,
      expectedVersion: variant.version,
    });
    expect(withCap.maxStockQty).toBe(40);

    const cleared = await updateVariantReplenishSettings(store, {
      ctx: admin(WS),
      workspaceId: WS,
      variantId: variant.id,
      maxStockQty: null,
      expectedVersion: withCap.version,
    });
    expect(cleared.maxStockQty).toBeNull();

    const readBack = await store.findVariantById(WS, variant.id);
    expect(readBack?.maxStockQty).toBeNull();
  });

  it('rejects negative and non-integer maxStockQty with CATALOG_VALIDATION', async () => {
    const store = new InMemoryCatalogStore();
    const variant = await createVariant(store, 'TSHIRT-REPLN-MAX-3');

    await expect(
      updateVariantReplenishSettings(store, {
        ctx: admin(WS),
        workspaceId: WS,
        variantId: variant.id,
        maxStockQty: -1,
        expectedVersion: variant.version,
      })
    ).rejects.toMatchObject({
      code: 'CATALOG_VALIDATION',
      message:
        'CATALOG_VALIDATION: Max stock qty must be a non-negative integer',
    });

    await expect(
      updateVariantReplenishSettings(store, {
        ctx: admin(WS),
        workspaceId: WS,
        variantId: variant.id,
        maxStockQty: 2.5,
        expectedVersion: variant.version,
      })
    ).rejects.toMatchObject({ code: 'CATALOG_VALIDATION' });

    const readBack = await store.findVariantById(WS, variant.id);
    expect(readBack?.maxStockQty).toBeNull();
  });

  it('forwards maxStockQty through bulkUpdateVariantReplenishSettings', async () => {
    const store = new InMemoryCatalogStore();
    const variant1 = await createVariant(store, 'TSHIRT-REPLN-MAX-4');
    const variant2 = await createVariant(store, 'TSHIRT-REPLN-MAX-5');

    const results = await bulkUpdateVariantReplenishSettings(store, {
      ctx: admin(WS),
      workspaceId: WS,
      items: [
        {
          variantId: variant1.id,
          maxStockQty: 60,
          expectedVersion: variant1.version,
        },
        {
          variantId: variant2.id,
          minStockQty: 5,
          maxStockQty: 25,
          expectedVersion: variant2.version,
        },
      ],
    });

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.id === variant1.id)?.maxStockQty).toBe(60);
    expect(results.find((r) => r.id === variant2.id)?.maxStockQty).toBe(25);
    expect(results.find((r) => r.id === variant2.id)?.minStockQty).toBe(5);

    const readBack1 = await store.findVariantById(WS, variant1.id);
    const readBack2 = await store.findVariantById(WS, variant2.id);
    expect(readBack1?.maxStockQty).toBe(60);
    expect(readBack2?.maxStockQty).toBe(25);
  });
});
