import { describe, expect, it } from 'vitest';
import { buildLowStockRecommendation } from '../low-stock-recommendation';

const base = {
  variantId: 'var_1',
  workspaceId: 'ws_1',
  skuCode: 'SKU-LOW-1',
  productName: 'Kaos Polos',
  variantName: 'Merah / M',
  availableQty: 3,
  minStockQty: 10,
  leadTimeDays: null as number | null,
  salesRatePerDay: null as number | null,
  missingSupplier: false,
  missingHpp: false,
};

const IN_TRANSIT_PREFIX = 'Stok dalam perjalanan:';
const CAP_PREFIX = 'Saran dibatasi stok maksimum:';

function hasLine(lines: string[], prefix: string): boolean {
  return lines.some((line) => line.startsWith(prefix));
}

describe('low-stock heuristic in-transit + max-stock cap (UTA-146 slice 1e)', () => {
  it('keeps today behavior when in-transit and max stock are not set', () => {
    const row = buildLowStockRecommendation(base);
    expect(row.suggestedReorderQty).toBe(7);
    expect(hasLine(row.explainability, IN_TRANSIT_PREFIX)).toBe(false);
    expect(hasLine(row.explainability, CAP_PREFIX)).toBe(false);

    const withNullMax = buildLowStockRecommendation({
      ...base,
      maxStockQty: null,
    });
    expect(withNullMax.suggestedReorderQty).toBe(7);
    expect(hasLine(withNullMax.explainability, CAP_PREFIX)).toBe(false);
  });

  it('subtracts in-transit units and treats negative in-transit as 0', () => {
    const row = buildLowStockRecommendation({ ...base, inTransitQty: 4 });
    expect(row.suggestedReorderQty).toBe(3);
    expect(row.availableQty).toBe(3);
    expect(row.explainability).toContain(
      'Stok dalam perjalanan: 4 unit — sudah dikurangi dari saran'
    );

    const negative = buildLowStockRecommendation({ ...base, inTransitQty: -5 });
    expect(negative.suggestedReorderQty).toBe(7);
    expect(hasLine(negative.explainability, IN_TRANSIT_PREFIX)).toBe(false);

    const covered = buildLowStockRecommendation({ ...base, inTransitQty: 20 });
    expect(covered.suggestedReorderQty).toBe(0);
    expect(hasLine(covered.explainability, CAP_PREFIX)).toBe(false);
  });

  it('caps the suggestion at max stock and never goes negative', () => {
    const capped = buildLowStockRecommendation({ ...base, maxStockQty: 8 });
    expect(capped.suggestedReorderQty).toBe(5);
    expect(capped.explainability).toContain(
      'Saran dibatasi stok maksimum: 8 unit'
    );

    const roomy = buildLowStockRecommendation({ ...base, maxStockQty: 50 });
    expect(roomy.suggestedReorderQty).toBe(7);
    expect(hasLine(roomy.explainability, CAP_PREFIX)).toBe(false);

    const atMax = buildLowStockRecommendation({
      ...base,
      inTransitQty: 6,
      maxStockQty: 8,
    });
    expect(atMax.suggestedReorderQty).toBe(0);
    expect(atMax.explainability).toContain(
      'Saran dibatasi stok maksimum: 8 unit'
    );
  });

  it('applies in-transit and max cap to lead-time demand', () => {
    const row = buildLowStockRecommendation({
      ...base,
      salesRatePerDay: 3,
      leadTimeDays: 5,
      inTransitQty: 4,
    });
    // leadDemand = 15; projected = 3 + 4 = 7; 15 - 7 = 8
    expect(row.suggestedReorderQty).toBe(8);
    expect(row.stockCoverDays).toBeCloseTo(1, 5);

    const capped = buildLowStockRecommendation({
      ...base,
      salesRatePerDay: 3,
      leadTimeDays: 5,
      inTransitQty: 4,
      maxStockQty: 10,
    });
    // room = 10 - 7 = 3
    expect(capped.suggestedReorderQty).toBe(3);
    expect(capped.explainability).toContain(
      'Saran dibatasi stok maksimum: 10 unit'
    );
  });
});
