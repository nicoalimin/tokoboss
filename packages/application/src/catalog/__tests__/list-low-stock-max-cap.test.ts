import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import type { TransferWithItems } from '../catalog-types';
import { InMemoryCatalogStore } from '../in-memory-catalog-store';
import {
  adjustStock,
  createProduct,
  createWarehouse,
  updateVariantReplenishSettings,
} from '../catalog-use-cases';
import { listLowStockRecommendations } from '../list-low-stock-recommendations';

const WS = 'ws_list_low_stock_max_cap_1';
const at = new Date('2026-10-01T00:00:00Z');
const CAP_LINE_PREFIX = 'Saran dibatasi stok maksimum';

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

function sentTransfer(
  id: string,
  variantId: string,
  sentQty: number
): TransferWithItems {
  return {
    transfer: {
      id,
      workspaceId: WS,
      referenceNum: `TRF-${id}`,
      sourceWarehouseId: 'wh_a',
      destWarehouseId: 'wh_b',
      status: 'sent',
      notes: null,
      expectedReceiveDate: null,
      version: 1,
      createdAt: at,
      updatedAt: at,
    },
    items: [
      {
        id: `${id}_item_0`,
        transferId: id,
        workspaceId: WS,
        variantId,
        requestedQty: sentQty,
        sentQty,
        receivedQty: 0,
        damagedQty: 0,
        cancellationReason: null,
        version: 1,
        createdAt: at,
        updatedAt: at,
      },
    ],
  };
}

/**
 * One active variant with minStock 10, the given maxStock (null = unset),
 * and 2 units available.
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
    code: 'JKT-LMC',
    name: 'Jakarta LMC',
  });
  const product = await createProduct(store, {
    ctx,
    workspaceId: WS,
    name: 'Product MC',
    unit: 'pcs',
    variants: [
      {
        skuCode: 'SKU-MC',
        name: 'MC',
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
    reason: 'seed low max-cap',
  });
  return { store, ctx, variantId: variant.id };
}

describe('listLowStockRecommendations max-stock wiring (UTA-146 slice 1f-ix)', () => {
  it('without a max stock setting suggests the full gap and has no cap line', async () => {
    const { store, ctx } = await seedLowVariant(null);

    const rows = await listLowStockRecommendations(store, {
      ctx,
      workspaceId: WS,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.availableQty).toBe(2);
    expect(rows[0]!.suggestedReorderQty).toBe(8);
    expect(
      rows[0]!.explainability.some((line) => line.startsWith(CAP_LINE_PREFIX))
    ).toBe(false);
  });

  it('caps the suggestion at the configured max stock and explains it', async () => {
    const { store, ctx } = await seedLowVariant(6);

    const rows = await listLowStockRecommendations(store, {
      ctx,
      workspaceId: WS,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.availableQty).toBe(2);
    expect(rows[0]!.suggestedReorderQty).toBe(4);
    expect(rows[0]!.explainability).toContain(
      'Saran dibatasi stok maksimum: 6 unit'
    );
  });

  it('leaves the suggestion unchanged when the max stock is above the gap', async () => {
    const { store, ctx } = await seedLowVariant(20);

    const rows = await listLowStockRecommendations(store, {
      ctx,
      workspaceId: WS,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.suggestedReorderQty).toBe(8);
    expect(
      rows[0]!.explainability.some((line) => line.startsWith(CAP_LINE_PREFIX))
    ).toBe(false);
  });

  it('applies the cap after units already in transit', async () => {
    const { store, ctx, variantId } = await seedLowVariant(6);
    vi.spyOn(store, 'listTransfersWithItems').mockResolvedValue([
      sentTransfer('t1', variantId, 3),
    ]);

    const rows = await listLowStockRecommendations(store, {
      ctx,
      workspaceId: WS,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.availableQty).toBe(2);
    expect(rows[0]!.suggestedReorderQty).toBe(1);
    expect(rows[0]!.explainability).toContain(
      'Stok dalam perjalanan: 3 unit — sudah dikurangi dari saran'
    );
    expect(rows[0]!.explainability).toContain(
      'Saran dibatasi stok maksimum: 6 unit'
    );
  });
});
