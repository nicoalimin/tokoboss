import { describe, expect, it } from 'vitest';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import { InMemoryCatalogStore } from '../in-memory-catalog-store';
import {
  bulkUpdateVariantReplenishSettings,
  createProduct,
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

const WS = 'ws_replenish_settings_bulk_1';

describe('bulkUpdateVariantReplenishSettings (Story 11 / UTA-146)', () => {
  it('updates replenish settings for two variants in a single bulk call', async () => {
    const store = new InMemoryCatalogStore();
    const ctx = admin(WS);

    // Seed a product with 2 variants
    const created = await createProduct(store, {
      ctx,
      workspaceId: WS,
      name: 'Kaos Polos',
      unit: 'pcs',
      variants: [
        {
          skuCode: 'TSHIRT-BULK-V1',
          name: 'Merah / M',
          sellingPriceCents: 99000,
          hppCents: 45000,
          costSource: 'manual',
        },
        {
          skuCode: 'TSHIRT-BULK-V2',
          name: 'Biru / L',
          sellingPriceCents: 99000,
          hppCents: 45000,
          costSource: 'manual',
        },
      ],
    });

    const variant1 = created.variants[0]!;
    const variant2 = created.variants[1]!;

    // Bulk update both variants
    const results = await bulkUpdateVariantReplenishSettings(store, {
      ctx,
      workspaceId: WS,
      items: [
        {
          variantId: variant1.id,
          minStockQty: 20,
          leadTimeDays: 7,
          expectedVersion: variant1.version,
        },
        {
          variantId: variant2.id,
          minStockQty: 30,
          leadTimeDays: 14,
          expectedVersion: variant2.version,
        },
      ],
    });

    // Assert both returned records have the new values
    expect(results).toHaveLength(2);

    const result1 = results.find((r) => r.id === variant1.id);
    const result2 = results.find((r) => r.id === variant2.id);

    expect(result1).toBeDefined();
    expect(result1?.minStockQty).toBe(20);
    expect(result1?.leadTimeDays).toBe(7);

    expect(result2).toBeDefined();
    expect(result2?.minStockQty).toBe(30);
    expect(result2?.leadTimeDays).toBe(14);

    // Assert findVariantById reflects the new values for both variants
    const readBack1 = await store.findVariantById(WS, variant1.id);
    expect(readBack1).not.toBeNull();
    expect(readBack1?.minStockQty).toBe(20);
    expect(readBack1?.leadTimeDays).toBe(7);

    const readBack2 = await store.findVariantById(WS, variant2.id);
    expect(readBack2).not.toBeNull();
    expect(readBack2?.minStockQty).toBe(30);
    expect(readBack2?.leadTimeDays).toBe(14);
  });
});
