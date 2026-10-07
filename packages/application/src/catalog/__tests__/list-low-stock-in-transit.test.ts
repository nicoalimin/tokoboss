import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import type { TransferStatus, TransferWithItems } from '../catalog-types';
import { InMemoryCatalogStore } from '../in-memory-catalog-store';
import {
  adjustStock,
  createProduct,
  createWarehouse,
  updateVariantReplenishSettings,
} from '../catalog-use-cases';
import { listLowStockRecommendations } from '../list-low-stock-recommendations';

const WS = 'ws_list_low_stock_in_transit_1';
const at = new Date('2026-10-01T00:00:00Z');

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

function transfer(
  id: string,
  status: TransferStatus,
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
      status,
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

/** One active variant with minStock 10 and 2 units available. */
async function seedLowVariant(): Promise<{
  store: InMemoryCatalogStore;
  ctx: WorkspaceContext;
  variantId: string;
}> {
  const store = new InMemoryCatalogStore();
  const ctx = admin(WS);
  const warehouse = await createWarehouse(store, {
    ctx,
    workspaceId: WS,
    code: 'JKT-LIT',
    name: 'Jakarta LIT',
  });
  const product = await createProduct(store, {
    ctx,
    workspaceId: WS,
    name: 'Product IT',
    unit: 'pcs',
    variants: [
      {
        skuCode: 'SKU-IT',
        name: 'IT',
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
    expectedVersion: variant.version,
  });
  await adjustStock(store, {
    ctx,
    workspaceId: WS,
    variantId: variant.id,
    warehouseId: warehouse.id,
    delta: 2,
    reason: 'seed low in-transit',
  });
  return { store, ctx, variantId: variant.id };
}

describe('listLowStockRecommendations in-transit wiring (UTA-146 slice 1e-v)', () => {
  it('without transfers suggests the full gap to min and has no in-transit line', async () => {
    const { store, ctx } = await seedLowVariant();

    const rows = await listLowStockRecommendations(store, {
      ctx,
      workspaceId: WS,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.availableQty).toBe(2);
    expect(rows[0]!.suggestedReorderQty).toBe(8);
    expect(
      rows[0]!.explainability.some((line) =>
        line.startsWith('Stok dalam perjalanan')
      )
    ).toBe(false);
  });

  it('subtracts units on sent transfers only and loads transfers for the workspace', async () => {
    const { store, ctx, variantId } = await seedLowVariant();
    const spy = vi
      .spyOn(store, 'listTransfersWithItems')
      .mockResolvedValue([
        transfer('t1', 'sent', variantId, 5),
        transfer('t2', 'draft', variantId, 9),
      ]);

    const rows = await listLowStockRecommendations(store, {
      ctx,
      workspaceId: WS,
    });

    expect(spy).toHaveBeenCalledWith(WS);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.availableQty).toBe(2);
    expect(rows[0]!.suggestedReorderQty).toBe(3);
    expect(rows[0]!.explainability).toContain(
      'Stok dalam perjalanan: 5 unit — sudah dikurangi dari saran'
    );
  });

  it('keeps the variant listed with suggested 0 when in-transit covers the gap', async () => {
    const { store, ctx, variantId } = await seedLowVariant();
    vi.spyOn(store, 'listTransfersWithItems').mockResolvedValue([
      transfer('t1', 'sent', variantId, 20),
    ]);

    const rows = await listLowStockRecommendations(store, {
      ctx,
      workspaceId: WS,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.availableQty).toBe(2);
    expect(rows[0]!.suggestedReorderQty).toBe(0);
  });
});
