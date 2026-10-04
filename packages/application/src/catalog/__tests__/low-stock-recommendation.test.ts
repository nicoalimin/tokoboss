import { describe, expect, it } from 'vitest';
import {
  buildLowStockRecommendation,
  isBelowMinStock,
} from '../low-stock-recommendation';

const base = {
  variantId: 'var_1',
  workspaceId: 'ws_1',
  skuCode: 'SKU-LOW-1',
  productName: 'Kaos Polos',
  variantName: 'Merah / M',
  availableQty: 2,
  minStockQty: 10,
  leadTimeDays: null as number | null,
  salesRatePerDay: null as number | null,
  missingSupplier: false,
  missingHpp: false,
};

describe('low-stock recommendation heuristic (Story 11 / UTA-146)', () => {
  it('isBelowMinStock is true only when available is strictly below min', () => {
    expect(isBelowMinStock({ availableQty: 2, minStockQty: 10 })).toBe(true);
    expect(isBelowMinStock({ availableQty: 10, minStockQty: 10 })).toBe(false);
    expect(isBelowMinStock({ availableQty: 11, minStockQty: 10 })).toBe(false);
  });

  it('suggests gap-to-min when sales rate is unknown', () => {
    const row = buildLowStockRecommendation(base);
    expect(row.suggestedReorderQty).toBe(8);
    expect(row.stockCoverDays).toBeNull();
    expect(row.explainability).toContain(
      'Belum ada data penjualan yang cukup untuk hitung laju jual'
    );
    expect(row.explainability).toContain(
      'Stok tersedia dari ledger gudang: 2 unit'
    );
  });

  it('raises suggested qty for lead-time demand when sales rate exists', () => {
    const row = buildLowStockRecommendation({
      ...base,
      salesRatePerDay: 3,
      leadTimeDays: 5,
    });
    // gapToMin = 8; leadDemand = ceil(15) = 15; leadDemand - available = 13
    expect(row.suggestedReorderQty).toBe(13);
    expect(row.stockCoverDays).toBeCloseTo(2 / 3, 5);
    expect(row.explainability).toContain(
      'Laju jual ~3 unit/hari (jendela lookback)'
    );
    expect(row.explainability).toContain('Lead time pengadaan: 5 hari');
  });

  it('flags missing HPP and supplier without inventing values', () => {
    const row = buildLowStockRecommendation({
      ...base,
      missingHpp: true,
      missingSupplier: true,
    });
    expect(row.missingHpp).toBe(true);
    expect(row.missingSupplier).toBe(true);
    expect(row.explainability).toContain('HPP belum diisi — tidak dibuat-buat');
    expect(row.explainability).toContain(
      'Supplier belum diisi — tidak dibuat-buat'
    );
  });
});
