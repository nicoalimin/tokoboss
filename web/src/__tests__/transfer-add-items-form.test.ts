import { describe, expect, it } from 'vitest';
import { validateTransferAddItemsForm } from '../components/transfer/TransfersPanel';

/**
 * Pure draft add-items form validator (UTA-139) — no DOM.
 */
describe('validateTransferAddItemsForm (UTA-139)', () => {
  it('rejects empty variantId or qty', () => {
    expect(
      validateTransferAddItemsForm({ variantId: '  ', requestedQty: '3' })
    ).toMatch(/SKU|jumlah|wajib/i);
    expect(
      validateTransferAddItemsForm({ variantId: 'var_1', requestedQty: '  ' })
    ).toMatch(/SKU|jumlah|wajib/i);
  });

  it('rejects non-integer and non-positive qty', () => {
    expect(
      validateTransferAddItemsForm({
        variantId: 'var_1',
        requestedQty: '1.5',
      })
    ).toMatch(/positif|wajib/i);
    expect(
      validateTransferAddItemsForm({ variantId: 'var_1', requestedQty: '0' })
    ).toMatch(/positif|wajib/i);
    expect(
      validateTransferAddItemsForm({ variantId: 'var_1', requestedQty: '-2' })
    ).toMatch(/positif|wajib/i);
    expect(
      validateTransferAddItemsForm({ variantId: 'var_1', requestedQty: 'abc' })
    ).toMatch(/positif|wajib/i);
  });

  it('accepts positive integer qty with variantId', () => {
    expect(
      validateTransferAddItemsForm({
        variantId: 'var_1',
        requestedQty: '12',
      })
    ).toBeNull();
  });
});
