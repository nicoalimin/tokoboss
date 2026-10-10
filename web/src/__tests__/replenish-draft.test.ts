import { describe, expect, it } from 'vitest';
import {
  CreatePurchaseOrderDraftBodySchema,
  type LowStockRecommendationView,
} from '@tokoboss/contracts';
import {
  buildDraftPoPreview,
  draftReferenceNum,
  toCreateDraftBody,
} from '../lib/replenish-draft';

/**
 * Story 11 draft-PO preview helpers (UTA-147 slice 3b): supplier-missing
 * SKUs blocked, missing HPP flagged (never invented), qty overrides applied.
 */

function rec(
  over: Partial<LowStockRecommendationView> = {}
): LowStockRecommendationView {
  return {
    variantId: 'v1',
    workspaceId: 'ws 1',
    skuCode: 'SKU-01',
    productName: 'Kaos Polos',
    variantName: 'Hitam / L',
    availableQty: 2,
    minStockQty: 10,
    leadTimeDays: 7,
    salesRatePerDay: 1.5,
    stockCoverDays: 1.3,
    suggestedReorderQty: 19,
    explainability: ['Stok di bawah minimum'],
    missingSupplier: false,
    missingHpp: false,
    ...over,
  };
}

describe('replenish-draft (UTA-147 slice 3b)', () => {
  it('blocks no-supplier SKUs, flags missing HPP, applies overrides, skips qty 0', () => {
    const preview = buildDraftPoPreview(
      [
        rec(),
        rec({
          variantId: 'v2',
          skuCode: 'SKU-02',
          variantName: null,
          missingHpp: true,
        }),
        rec({ variantId: 'v3', skuCode: 'SKU-03', missingSupplier: true }),
        rec({ variantId: 'v4', skuCode: 'SKU-04', suggestedReorderQty: 0 }),
        rec({ variantId: 'v5', skuCode: 'SKU-05' }),
      ],
      { v2: 5, v5: 0 }
    );

    expect(preview.lines).toEqual([
      {
        variantId: 'v1',
        skuCode: 'SKU-01',
        label: 'Kaos Polos Hitam / L',
        quantity: 19,
        missingHpp: false,
      },
      {
        variantId: 'v2',
        skuCode: 'SKU-02',
        label: 'Kaos Polos',
        quantity: 5,
        missingHpp: true,
      },
    ]);
    expect(preview.blockedNoSupplier).toEqual(['SKU-03']);
    expect(preview.missingHppCount).toBe(1);
    expect(preview.canCreate).toBe(true);

    const empty = buildDraftPoPreview([rec({ missingSupplier: true })]);
    expect(empty.lines).toEqual([]);
    expect(empty.canCreate).toBe(false);
  });

  it('builds a valid create body without inventing unit costs', () => {
    const preview = buildDraftPoPreview([rec(), rec({ variantId: 'v2' })], {
      v2: 3,
    });
    const ref = draftReferenceNum(new Date('2026-10-10T11:51:24.000Z'));
    expect(ref).toBe('PO-20261010-1151');

    const body = toCreateDraftBody(preview, ref, { supplierName: 'Toko A' });
    expect(body).toEqual({
      referenceNum: 'PO-20261010-1151',
      supplierName: 'Toko A',
      notes: null,
      items: [
        { variantId: 'v1', quantity: 19 },
        { variantId: 'v2', quantity: 3 },
      ],
    });
    expect(body.items.some((i) => 'unitCostCents' in i)).toBe(false);
    expect(CreatePurchaseOrderDraftBodySchema.safeParse(body).success).toBe(
      true
    );
  });
});
