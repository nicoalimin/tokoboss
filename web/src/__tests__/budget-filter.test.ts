import { describe, expect, it } from 'vitest';
import { parseBudgetRupiah } from '../components/replenish/BudgetFilter';

/**
 * Story 11 Stok tipis budget cap (UTA-147 slice 6c): the operator types a
 * whole-rupiah amount; only a positive whole number reaches the panel as
 * cents. Invalid input is rejected (null), never rounded or guessed.
 */

describe('parseBudgetRupiah (UTA-147 slice 6c)', () => {
  it('converts whole rupiah, with dot or space separators, into cents', () => {
    expect(parseBudgetRupiah('1500000')).toBe(150_000_000);
    expect(parseBudgetRupiah('1.500.000')).toBe(150_000_000);
    expect(parseBudgetRupiah(' 250 000 ')).toBe(25_000_000);
    expect(parseBudgetRupiah('1')).toBe(100);
  });

  it('rejects empty, zero, negative, decimal, non-numeric and unsafe input', () => {
    for (const raw of [
      '',
      '   ',
      '0',
      '000',
      '-5000',
      '1500,50',
      '12a',
      'Rp 5000',
    ]) {
      expect(parseBudgetRupiah(raw)).toBeNull();
    }
    expect(parseBudgetRupiah('9'.repeat(20))).toBeNull();
  });
});
