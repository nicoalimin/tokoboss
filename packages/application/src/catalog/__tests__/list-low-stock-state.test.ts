import { describe, expect, it } from 'vitest';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import { InMemoryCatalogStore } from '../in-memory-catalog-store';
import {
  adjustStock,
  createProduct,
  createWarehouse,
  updateVariantReplenishSettings,
} from '../catalog-use-cases';
import { listLowStockRecommendations } from '../list-low-stock-recommendations';

const WS = 'ws_list_low_stock_state_1';
const now = new Date('2026-10-08T00:00:00Z');

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
 * One active variant with minStock 10, the given maxStock (null = unset),
 * and 2 units available, so it is below min stock.
 */
async function seedLowVariant(maxStockQty: number | null): Promise<{
  store: InMemoryCatalogStore;
  ctx: WorkspaceContext;
  variantId: string;
}> {
  const store = new InMemoryCatalogStore();
  const ctx = admin(WS);
  const warehouse = await createWarehouse(store, {
    ctx,
    workspaceId: WS,
    code: 'JKT-LST',
    name: 'Jakarta LST',
  });
  const product = await createProduct(store, {
    ctx,
    workspaceId: WS,
    name: 'Product ST',
    unit: 'pcs',
    variants: [
      {
        skuCode: 'SKU-ST',
        name: 'ST',
        sellingPriceCents: 10000,
        hppCents: 4000,
        costSource: 'manual',
      },
    ],
  });
  const variant = product.variants[0]!;
  await updateVariantReplenishSettings(store, {
    ctx,
    workspaceId: WS,
    variantId: variant.id,
    minStockQty: 10,
    leadTimeDays: null,
    maxStockQty,
    expectedVersion: variant.version,
  });
  await adjustStock(store, {
    ctx,
    workspaceId: WS,
    variantId: variant.id,
    warehouseId: warehouse.id,
    delta: 2,
    reason: 'seed low state',
  });
  return { store, ctx, variantId: variant.id };
}

describe('listLowStockRecommendations — recommendation state (Slice 1g)', () => {
  it('leaves out a dismissed variant', async () => {
    const { store, ctx, variantId } = await seedLowVariant(null);
    await store.upsertRecommendationState(
      WS,
      variantId,
      {
        status: 'dismissed',
        snoozedUntil: null,
        suggestedReorderQtyOverride: null,
      },
      null
    );

    const rows = await listLowStockRecommendations(store, {
      ctx,
      workspaceId: WS,
      now,
    });
    expect(rows).toHaveLength(0);
  });

  it('hides a snoozed variant until snoozedUntil has passed', async () => {
    const { store, ctx, variantId } = await seedLowVariant(null);
    await store.upsertRecommendationState(
      WS,
      variantId,
      {
        status: 'snoozed',
        snoozedUntil: new Date('2026-10-09T00:00:00Z'),
        suggestedReorderQtyOverride: null,
      },
      null
    );

    const during = await listLowStockRecommendations(store, {
      ctx,
      workspaceId: WS,
      now,
    });
    expect(during).toHaveLength(0);

    const after = await listLowStockRecommendations(store, {
      ctx,
      workspaceId: WS,
      now: new Date('2026-10-10T00:00:00Z'),
    });
    expect(after).toHaveLength(1);
    expect(after[0]!.variantId).toBe(variantId);
  });

  it('uses the seller-edited qty without re-capping it by max stock', async () => {
    const { store, ctx, variantId } = await seedLowVariant(5);
    await store.upsertRecommendationState(
      WS,
      variantId,
      { status: 'active', snoozedUntil: null, suggestedReorderQtyOverride: 20 },
      null
    );

    const rows = await listLowStockRecommendations(store, {
      ctx,
      workspaceId: WS,
      now,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.suggestedReorderQty).toBe(20);
    expect(rows[0]!.explainability.at(-1)).toBe(
      'Jumlah saran diubah penjual: 20 unit'
    );
  });

  it('applies the override once an expired snooze lists the variant again', async () => {
    const { store, ctx, variantId } = await seedLowVariant(null);
    await store.upsertRecommendationState(
      WS,
      variantId,
      {
        status: 'snoozed',
        snoozedUntil: new Date('2026-10-01T00:00:00Z'),
        suggestedReorderQtyOverride: 3,
      },
      null
    );

    const rows = await listLowStockRecommendations(store, {
      ctx,
      workspaceId: WS,
      now,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.suggestedReorderQty).toBe(3);
    expect(rows[0]!.explainability.at(-1)).toBe(
      'Jumlah saran diubah penjual: 3 unit'
    );
  });
});
