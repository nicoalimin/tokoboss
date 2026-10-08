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

const WS = 'ws_list_low_stock_budget_1';
const BUDGET_LINE_PREFIX = 'Saran dipotong plafon anggaran';
const NO_HPP_LINE = 'HPP kosong — saran ini tidak dihitung ke plafon anggaran';

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
 * Three active variants, each min 10 with 2 on hand (suggestion 8):
 * SKU-BG-A HPP Rp 40, SKU-BG-B HPP Rp 20, SKU-BG-C without HPP.
 */
async function seedThreeLow(): Promise<{
  store: InMemoryCatalogStore;
  ctx: WorkspaceContext;
}> {
  const store = new InMemoryCatalogStore();
  const ctx = admin(WS);
  const warehouse = await createWarehouse(store, {
    ctx,
    workspaceId: WS,
    code: 'JKT-LBG',
    name: 'Jakarta LBG',
  });
  const product = await createProduct(store, {
    ctx,
    workspaceId: WS,
    name: 'Product BG',
    unit: 'pcs',
    variants: [
      {
        skuCode: 'SKU-BG-A',
        name: 'A',
        sellingPriceCents: 9000,
        hppCents: 4000,
      },
      {
        skuCode: 'SKU-BG-B',
        name: 'B',
        sellingPriceCents: 5000,
        hppCents: 2000,
      },
      {
        skuCode: 'SKU-BG-C',
        name: 'C',
        sellingPriceCents: 3000,
        hppCents: null,
      },
    ],
  });
  for (const variant of product.variants) {
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
      reason: 'seed low budget',
    });
  }
  return { store, ctx };
}

function hasBudgetLine(lines: readonly string[]): boolean {
  return lines.some(
    (line) => line.startsWith(BUDGET_LINE_PREFIX) || line === NO_HPP_LINE
  );
}

describe('listLowStockRecommendations budget cap wiring (UTA-146 slice 1i-iii)', () => {
  it('without a budget (omitted or null) keeps every suggestion and adds no budget line', async () => {
    const { store, ctx } = await seedThreeLow();

    for (const budgetCents of [undefined, null]) {
      const rows = await listLowStockRecommendations(store, {
        ctx,
        workspaceId: WS,
        budgetCents,
      });

      expect(rows.map((r) => r.skuCode)).toEqual([
        'SKU-BG-A',
        'SKU-BG-B',
        'SKU-BG-C',
      ]);
      expect(rows.map((r) => r.suggestedReorderQty)).toEqual([8, 8, 8]);
      expect(rows.some((r) => hasBudgetLine(r.explainability))).toBe(false);
    }
  });

  it('spends the budget in SKU order and trims the row that no longer fits', async () => {
    const { store, ctx } = await seedThreeLow();

    const rows = await listLowStockRecommendations(store, {
      ctx,
      workspaceId: WS,
      budgetCents: 40_000,
    });

    expect(rows.map((r) => r.skuCode)).toEqual([
      'SKU-BG-A',
      'SKU-BG-B',
      'SKU-BG-C',
    ]);
    expect(rows.map((r) => r.suggestedReorderQty)).toEqual([8, 4, 8]);
    expect(hasBudgetLine(rows[0]!.explainability)).toBe(false);
    expect(rows[1]!.explainability).toContain(
      'Saran dipotong plafon anggaran Rp 400: 8 → 4 unit'
    );
    expect(rows[2]!.explainability).toContain(NO_HPP_LINE);
  });

  it('with a zero budget cuts priced rows to 0 but keeps them listed', async () => {
    const { store, ctx } = await seedThreeLow();

    const rows = await listLowStockRecommendations(store, {
      ctx,
      workspaceId: WS,
      budgetCents: 0,
    });

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.suggestedReorderQty)).toEqual([0, 0, 8]);
    expect(rows[0]!.explainability).toContain(
      'Saran dipotong plafon anggaran Rp 0: 8 → 0 unit'
    );
    expect(rows[2]!.missingHpp).toBe(true);
  });
});
