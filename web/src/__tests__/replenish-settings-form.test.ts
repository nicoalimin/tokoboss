import { describe, expect, it } from 'vitest';
import { UpdateReplenishSettingsBodySchema } from '@tokoboss/contracts';
import {
  ambangFormFromSettings,
  buildAmbangBody,
} from '../lib/replenish-settings-form';

/**
 * Story 11 Ambang form helpers (UTA-147 slice 4d): whole numbers only,
 * min stock required, empty lead time / max stock clears to null, never
 * rounded or guessed, expectedVersion passed through for CAS.
 */

describe('replenish-settings-form (UTA-147 slice 4d)', () => {
  it('round-trips settings to form text and builds a schema-valid body', () => {
    const form = ambangFormFromSettings({
      minStockQty: 10,
      leadTimeDays: null,
      maxStockQty: 0,
    });
    expect(form).toEqual({
      minStockQty: '10',
      leadTimeDays: '',
      maxStockQty: '0',
    });

    const result = buildAmbangBody(
      { minStockQty: ' 12 ', leadTimeDays: '7', maxStockQty: '' },
      3
    );
    expect(result).toEqual({
      ok: true,
      body: {
        expectedVersion: 3,
        minStockQty: 12,
        leadTimeDays: 7,
        maxStockQty: null,
      },
    });
    if (!result.ok) throw new Error('expected ok');
    expect(
      UpdateReplenishSettingsBodySchema.safeParse(result.body).success
    ).toBe(true);
  });

  it('requires min stock and rejects negative, decimal, text and unsafe numbers', () => {
    expect(
      buildAmbangBody(
        { minStockQty: '', leadTimeDays: '-1', maxStockQty: '2.5' },
        1
      )
    ).toEqual({
      ok: false,
      errors: {
        minStockQty: 'Stok minimum wajib diisi.',
        leadTimeDays: 'Lama kirim harus angka bulat (hari), 0 atau lebih.',
        maxStockQty: 'Stok maksimum harus angka bulat 0 atau lebih.',
      },
    });

    expect(
      buildAmbangBody(
        {
          minStockQty: 'sepuluh',
          leadTimeDays: '',
          maxStockQty: '99999999999999999999',
        },
        1
      )
    ).toEqual({
      ok: false,
      errors: {
        minStockQty: 'Stok minimum harus angka bulat 0 atau lebih.',
        maxStockQty: 'Stok maksimum harus angka bulat 0 atau lebih.',
      },
    });
  });
});
