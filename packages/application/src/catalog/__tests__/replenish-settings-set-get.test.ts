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

const WS = 'ws_replenish_settings_set_get_1';

describe('updateVariantReplenishSettings set+get (Story 11 / UTA-146)', () => {
  it('sets minStockQty and leadTimeDays via use-case and reads them back', async () => {
    const store = new InMemoryCatalogStore();
    const created = await createProduct(store, {
      ctx: admin(WS),
      workspaceId: WS,
      name: 'Kaos Polos',
      unit: 'pcs',
      variants: [
        {
          skuCode: 'TSHIRT-REPLN-SETGET-1',
          name: 'Merah / M',
          sellingPriceCents: 99000,
          hppCents: 45000,
          costSource: 'manual',
        },
      ],
    });
    const variant = created.variants[0]!;

    const updated = await updateVariantReplenishSettings(store, {
      ctx: admin(WS),
      workspaceId: WS,
      variantId: variant.id,
      minStockQty: 10,
      leadTimeDays: 5,
      expectedVersion: variant.version,
    });

    expect(updated.minStockQty).toBe(10);
    expect(updated.leadTimeDays).toBe(5);

    const readBack = await store.findVariantById(WS, variant.id);
    expect(readBack).not.toBeNull();
    expect(readBack?.minStockQty).toBe(10);
    expect(readBack?.leadTimeDays).toBe(5);
  });
});
