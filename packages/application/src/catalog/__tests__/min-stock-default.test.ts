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

const WS = 'ws_min_stock_default_1';

describe('catalog minStockQty default (Story 11 / UTA-146)', () => {
  it('sets minStockQty null on createProduct variants', async () => {
    const store = new InMemoryCatalogStore();
    const created = await createProduct(store, {
      ctx: admin(WS),
      workspaceId: WS,
      name: 'Kaos Polos',
      unit: 'pcs',
      variants: [
        {
          skuCode: 'TSHIRT-MINSTOCK-1',
          name: 'Merah / M',
          sellingPriceCents: 99000,
          hppCents: 45000,
          costSource: 'manual',
        },
      ],
    });
    expect(created.variants).toHaveLength(1);
    expect(created.variants[0]?.minStockQty).toBeNull();
  });
});
