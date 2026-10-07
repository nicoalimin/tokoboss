import { describe, expect, it } from 'vitest';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import { InMemoryCatalogStore } from '../in-memory-catalog-store';
import { createProduct } from '../catalog-use-cases';

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

const WS = 'ws_update_variant_max_stock_1';

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

describe('updateVariant maxStockQty (Story 11 / UTA-146)', () => {
  it('starts new variants with maxStockQty null (no cap)', async () => {
    const store = new InMemoryCatalogStore();
    const variant = await createVariant(store, 'TSHIRT-MAXSTOCK-1');

    expect(variant.maxStockQty).toBeNull();

    const readBack = await store.findVariantById(WS, variant.id);
    expect(readBack?.maxStockQty).toBeNull();
  });

  it('sets maxStockQty and reads it back', async () => {
    const store = new InMemoryCatalogStore();
    const variant = await createVariant(store, 'TSHIRT-MAXSTOCK-2');

    const updated = await store.updateVariant(
      WS,
      variant.id,
      { maxStockQty: 50 },
      variant.version
    );

    expect(updated.maxStockQty).toBe(50);

    const readBack = await store.findVariantById(WS, variant.id);
    expect(readBack?.maxStockQty).toBe(50);
  });

  it('leaves maxStockQty unchanged when omitted and clears it with null', async () => {
    const store = new InMemoryCatalogStore();
    const variant = await createVariant(store, 'TSHIRT-MAXSTOCK-3');

    const withCap = await store.updateVariant(
      WS,
      variant.id,
      { maxStockQty: 40 },
      variant.version
    );
    expect(withCap.maxStockQty).toBe(40);

    const minOnly = await store.updateVariant(
      WS,
      withCap.id,
      { minStockQty: 10 },
      withCap.version
    );
    expect(minOnly.minStockQty).toBe(10);
    expect(minOnly.maxStockQty).toBe(40);

    const cleared = await store.updateVariant(
      WS,
      minOnly.id,
      { maxStockQty: null },
      minOnly.version
    );
    expect(cleared.maxStockQty).toBeNull();
    expect(cleared.minStockQty).toBe(10);
  });
});
