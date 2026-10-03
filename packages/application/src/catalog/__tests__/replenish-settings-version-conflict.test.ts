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

const WS = 'ws_replenish_settings_version_conflict_1';

describe('updateVariantReplenishSettings version conflict (Story 11 / UTA-146)', () => {
  it('rejects stale expectedVersion with CATALOG_VERSION_CONFLICT', async () => {
    const store = new InMemoryCatalogStore();
    const created = await createProduct(store, {
      ctx: admin(WS),
      workspaceId: WS,
      name: 'Kaos Polos',
      unit: 'pcs',
      variants: [
        {
          skuCode: 'TSHIRT-REPLN-VERCON-1',
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
        minStockQty: 10,
        leadTimeDays: 5,
        expectedVersion: variant.version + 99,
      })
    ).rejects.toMatchObject({ code: 'CATALOG_VERSION_CONFLICT' });
  });
});
