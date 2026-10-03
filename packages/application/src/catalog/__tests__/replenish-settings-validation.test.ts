import { describe, expect, it } from 'vitest';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import { InMemoryCatalogStore } from '../in-memory-catalog-store';
import {
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

const WS = 'ws_replenish_settings_validation_1';

describe('updateVariantReplenishSettings validation (Story 11 / UTA-146)', () => {
  it('rejects negative minStockQty with CATALOG_VALIDATION', async () => {
    const store = new InMemoryCatalogStore();
    const created = await createProduct(store, {
      ctx: admin(WS),
      workspaceId: WS,
      name: 'Kaos Polos',
      unit: 'pcs',
      variants: [
        {
          skuCode: 'TSHIRT-REPLN-VAL-1',
          name: 'Merah / M',
          sellingPriceCents: 99000,
          hppCents: 45000,
          costSource: 'manual',
        },
      ],
    });
    const variant = created.variants[0]!;

    await expect(
      updateVariantReplenishSettings(store, {
        ctx: admin(WS),
        workspaceId: WS,
        variantId: variant.id,
        minStockQty: -1,
        expectedVersion: variant.version,
      })
    ).rejects.toMatchObject({ code: 'CATALOG_VALIDATION' });
  });
});
