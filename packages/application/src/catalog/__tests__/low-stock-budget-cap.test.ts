import { describe, expect, it } from 'vitest';
import { applyBudgetCap } from '../low-stock-budget-cap';
import type { LowStockRecommendation } from '../low-stock-recommendation';

function row(
  variantId: string,
  suggestedReorderQty: number
): LowStockRecommendation {
  return {
    variantId,
    workspaceId: 'ws_1',
    skuCode: `SKU-${variantId}`,
    productName: `Produk ${variantId}`,
    variantName: null,
    availableQty: 3,
    minStockQty: 10,
    leadTimeDays: 7,
    salesRatePerDay: 2,
    stockCoverDays: 1.5,
    suggestedReorderQty,
    explainability: ['Stok di bawah minimum'],
    missingSupplier: false,
    missingHpp: false,
  };
}

describe('applyBudgetCap (UTA-146 slice 1i-ii)', () => {
  it('returns unchanged copies when no budget is configured', () => {
    const rows = [row('v1', 42), row('v2', 5)];
    const hppCentsByVariant = new Map([['v1', 4_500_000]]);

    for (const budgetCents of [null, undefined]) {
      const result = applyBudgetCap(rows, { budgetCents, hppCentsByVariant });
      expect(result).toEqual(rows);
      expect(result[0]).not.toBe(rows[0]);
      expect(result[0]?.explainability).not.toBe(rows[0]?.explainability);
    }
  });

  it('trims rows in the given order so the subtotal stays within budget', () => {
    const rows = [row('v1', 42), row('v2', 5)];
    const result = applyBudgetCap(rows, {
      budgetCents: 150_000_000,
      hppCentsByVariant: new Map([
        ['v1', 4_500_000],
        ['v2', 2_000_000],
      ]),
    });

    expect(result.map((r) => r.suggestedReorderQty)).toEqual([33, 0]);
    expect(result[0]?.explainability).toEqual([
      'Stok di bawah minimum',
      'Saran dipotong plafon anggaran Rp 1.500.000: 42 → 33 unit',
    ]);
    expect(result[1]?.explainability).toEqual([
      'Stok di bawah minimum',
      'Saran dipotong plafon anggaran Rp 1.500.000: 5 → 0 unit',
    ]);
    expect(rows.map((r) => r.suggestedReorderQty)).toEqual([42, 5]);
    expect(rows[0]?.explainability).toEqual(['Stok di bawah minimum']);
  });

  it('leaves rows without HPP uncapped and does not charge them to the budget', () => {
    const rows = [row('v1', 8), row('v2', 6), row('v3', 4)];
    const result = applyBudgetCap(rows, {
      budgetCents: 1_000_000,
      hppCentsByVariant: new Map<string, number | null>([
        ['v1', null],
        ['v2', 0],
        ['v3', 250_000],
      ]),
    });

    expect(result.map((r) => r.suggestedReorderQty)).toEqual([8, 6, 4]);
    expect(result[0]?.explainability).toContain(
      'HPP kosong — saran ini tidak dihitung ke plafon anggaran'
    );
    expect(result[1]?.explainability).toContain(
      'HPP kosong — saran ini tidak dihitung ke plafon anggaran'
    );
    expect(result[2]?.explainability).toEqual(['Stok di bawah minimum']);
  });
});
