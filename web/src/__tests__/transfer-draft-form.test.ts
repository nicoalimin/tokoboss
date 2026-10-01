import { describe, expect, it } from 'vitest';
import { validateTransferDraftForm } from '../components/transfer/TransfersPanel';

/**
 * Pure create-draft form validator (UTA-138) — no DOM.
 */
describe('validateTransferDraftForm (UTA-138)', () => {
  it('rejects empty required fields', () => {
    expect(
      validateTransferDraftForm({
        referenceNum: '  ',
        sourceWarehouseId: 'wh_a',
        destWarehouseId: 'wh_b',
        notes: '',
      })
    ).toMatch(/wajib/i);
  });

  it('rejects source === dest', () => {
    expect(
      validateTransferDraftForm({
        referenceNum: 'TRF-1',
        sourceWarehouseId: 'wh_a',
        destWarehouseId: 'wh_a',
        notes: '',
      })
    ).toMatch(/berbeda/i);
  });

  it('accepts valid draft input', () => {
    expect(
      validateTransferDraftForm({
        referenceNum: 'TRF-1',
        sourceWarehouseId: 'wh_a',
        destWarehouseId: 'wh_b',
        notes: 'optional',
      })
    ).toBeNull();
  });
});
