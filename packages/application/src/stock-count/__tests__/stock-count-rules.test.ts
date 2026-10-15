import { describe, expect, it } from 'vitest';
import {
  computeMovement,
  computeVariance,
  flagReasons,
  isTerminalStatus,
  isValidEntryQty,
  ledgerReasonFor,
  mergeEntry,
  nextStatus,
} from '../stock-count-rules';

describe('stock-count-rules (D1 variance / movement / ledger)', () => {
  it('computeVariance null for uncounted; movement = system − snapshot; ledger reasons by sign', () => {
    expect(
      computeVariance({ countedQty: null, systemQtyAtCount: 10 })
    ).toBeNull();
    expect(
      computeVariance({ countedQty: 8, systemQtyAtCount: null })
    ).toBeNull();
    expect(computeVariance({ countedQty: 12, systemQtyAtCount: 10 })).toBe(2);
    expect(computeVariance({ countedQty: 7, systemQtyAtCount: 10 })).toBe(-3);
    expect(computeVariance({ countedQty: 0, systemQtyAtCount: 5 })).toBe(-5);

    expect(computeMovement(10, 8)).toBe(-2);
    expect(computeMovement(10, 15)).toBe(5);

    expect(ledgerReasonFor(null)).toBeNull();
    expect(ledgerReasonFor(0)).toBeNull();
    expect(ledgerReasonFor(3)).toBe('adj_opname_in');
    expect(ledgerReasonFor(-4)).toBe('adj_opname_out');
  });
});

describe('stock-count-rules (D4 flags)', () => {
  it('flags large_negative (≥50%), explicit_zero, and negative_result; skips uncounted', () => {
    expect(flagReasons({ countedQty: null, systemQtyAtCount: 10 }, 10)).toEqual(
      []
    );

    expect(flagReasons({ countedQty: 4, systemQtyAtCount: 10 }, 10)).toEqual([
      'large_negative',
    ]);
    // just under 50% → no large_negative
    expect(flagReasons({ countedQty: 6, systemQtyAtCount: 10 }, 10)).toEqual(
      []
    );

    expect(flagReasons({ countedQty: 0, systemQtyAtCount: 10 }, 10)).toEqual([
      'large_negative',
      'explicit_zero',
    ]);

    // system 0 → no (a)/(b)
    expect(flagReasons({ countedQty: 0, systemQtyAtCount: 0 }, 0)).toEqual([]);

    // (c) only: variance −2 (<50% of 10) but live 1 + (−2) < 0
    expect(flagReasons({ countedQty: 8, systemQtyAtCount: 10 }, 1)).toEqual([
      'negative_result',
    ]);
  });
});

describe('stock-count-rules (merge + transitions)', () => {
  it('mergeEntry add/replace; nextStatus machine; terminal; entry qty bounds', () => {
    expect(mergeEntry(null, 3, 'add')).toBe(3);
    expect(mergeEntry(5, 2, 'add')).toBe(7);
    expect(mergeEntry(5, 9, 'replace')).toBe(9);
    expect(mergeEntry(null, 4, 'replace')).toBe(4);

    expect(nextStatus('counting', 'submit')).toBe('submitted');
    expect(nextStatus('submitted', 'return')).toBe('counting');
    expect(nextStatus('counting', 'cancel')).toBe('cancelled');
    expect(nextStatus('submitted', 'cancel')).toBe('cancelled');
    expect(nextStatus('submitted', 'post')).toBe('posted');
    expect(nextStatus('posted', 'cancel')).toBeNull();
    expect(nextStatus('cancelled', 'submit')).toBeNull();
    expect(nextStatus('counting', 'post')).toBeNull();

    expect(isTerminalStatus('posted')).toBe(true);
    expect(isTerminalStatus('cancelled')).toBe(true);
    expect(isTerminalStatus('counting')).toBe(false);

    expect(isValidEntryQty(0)).toBe(true);
    expect(isValidEntryQty(1_000_000)).toBe(true);
    expect(isValidEntryQty(-1)).toBe(false);
    expect(isValidEntryQty(1.5)).toBe(false);
    expect(isValidEntryQty(1_000_001)).toBe(false);
  });
});
