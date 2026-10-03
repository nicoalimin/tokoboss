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

const WS = 'ws_update_variant_min_lead_1';

describe('updateVariant minStockQty and leadTimeDays (Story 11 / UTA-146)', () => {
  it('sets minStockQty and leadTimeDays and reads them back', async () => {
    const store = new InMemoryCatalogStore();
    const created = await createProduct(store, {
      ctx: admin(WS),
      workspaceId: WS,
      name: 'Kaos Polos',
      unit: 'pcs',
      variants: [
        {
          skuCode: 'TSHIRT-UPDATE-MINLEAD-1',
          name: 'Merah / M',
          sellingPriceCents: 99000,
          hppCents: 45000,
          costSource: 'manual',
        },
      ],
    });
    const variant = created.variants[0]!;

    const updated = await store.updateVariant(
      WS,
      variant.id,
      {
        minStockQty: 10,
        leadTimeDays: 5,
      },
      variant.version
    );

    expect(updated.minStockQty).toBe(10);
    expect(updated.leadTimeDays).toBe(5);

    const readBack = await store.findVariantById(WS, variant.id);
    expect(readBack).not.toBeNull();
    expect(readBack?.minStockQty).toBe(10);
    expect(readBack?.leadTimeDays).toBe(5);
  });

  it('accepts null to clear both fields', async () => {
    const store = new InMemoryCatalogStore();
    const created = await createProduct(store, {
      ctx: admin(WS),
      workspaceId: WS,
      name: 'Kaos Polos',
      unit: 'pcs',
      variants: [
        {
          skuCode: 'TSHIRT-UPDATE-MINLEAD-2',
          name: 'Biru / L',
          sellingPriceCents: 99000,
          hppCents: 45000,
          costSource: 'manual',
        },
      ],
    });
    const variant = created.variants[0];
    expect(variant).toBeDefined();

    const updated = await store.updateVariant(
      WS,
      variant.id,
      {
        minStockQty: 20,
        leadTimeDays: 7,
      },
      variant.version
    );

    expect(updated.minStockQty).toBe(20);
    expect(updated.leadTimeDays).toBe(7);

    const cleared = await store.updateVariant(
      WS,
      updated.id,
      {
        minStockQty: null,
        leadTimeDays: null,
      },
      updated.version
    );

    expect(cleared.minStockQty).toBeNull();
    expect(cleared.leadTimeDays).toBeNull();
  });

  it('rejects wrong expectedVersion with version conflict', async () => {
    const store = new InMemoryCatalogStore();
    const created = await createProduct(store, {
      ctx: admin(WS),
      workspaceId: WS,
      name: 'Kaos Polos',
      unit: 'pcs',
      variants: [
        {
          skuCode: 'TSHIRT-UPDATE-MINLEAD-3',
          name: 'Hitam / XL',
          sellingPriceCents: 99000,
          hppCents: 45000,
          costSource: 'manual',
        },
      ],
    });
    const variant = created.variants[0];
    expect(variant).toBeDefined();

    await expect(
      store.updateVariant(
        WS,
        variant.id,
        {
          minStockQty: 5,
          leadTimeDays: 3,
        },
        variant.version + 99
      )
    ).rejects.toMatchObject({ code: 'CATALOG_VERSION_CONFLICT' });
  });
});
