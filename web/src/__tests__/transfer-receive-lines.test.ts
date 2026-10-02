import { describe, expect, it } from 'vitest';
import {
  buildReceiveTransferItems,
  defaultReceiveLineQtys,
  sentQtyForReceiveLine,
} from '../components/transfer/TransfersPanel';

/**
 * Pure partial/damaged receive payload helpers (UTA-145) — no DOM.
 */
describe('sentQtyForReceiveLine / defaultReceiveLineQtys (UTA-145)', () => {
  it('prefers sentQty when > 0, else requestedQty', () => {
    expect(sentQtyForReceiveLine({ sentQty: 4, requestedQty: 9 })).toBe(4);
    expect(sentQtyForReceiveLine({ sentQty: 0, requestedQty: 9 })).toBe(9);
  });

  it('defaults receivedQty to sent qty and damagedQty to 0', () => {
    expect(defaultReceiveLineQtys({ sentQty: 3, requestedQty: 5 })).toEqual({
      receivedQty: '3',
      damagedQty: '0',
    });
  });
});

describe('buildReceiveTransferItems (UTA-145)', () => {
  const items = [
    { id: 'ti_1', sentQty: 5, requestedQty: 5 },
    { id: 'ti_2', sentQty: 0, requestedQty: 2 },
  ];

  it('builds items[] with itemId, receivedQty, and optional damagedQty', () => {
    const result = buildReceiveTransferItems(items, {
      ti_1: { receivedQty: '4', damagedQty: '1' },
      ti_2: { receivedQty: '2', damagedQty: '0' },
    });
    expect(result).toEqual({
      items: [
        { itemId: 'ti_1', receivedQty: 4, damagedQty: 1 },
        { itemId: 'ti_2', receivedQty: 2 },
      ],
    });
  });

  it('rejects NaN / negatives / non-integers with BI error', () => {
    expect(
      buildReceiveTransferItems(items, {
        ti_1: { receivedQty: '-1', damagedQty: '0' },
        ti_2: { receivedQty: '2', damagedQty: '0' },
      })
    ).toMatchObject({ error: expect.stringMatching(/non-negatif|bilangan/i) });

    expect(
      buildReceiveTransferItems(items, {
        ti_1: { receivedQty: '1.5', damagedQty: '0' },
        ti_2: { receivedQty: '2', damagedQty: '0' },
      })
    ).toMatchObject({ error: expect.stringMatching(/non-negatif|bilangan/i) });

    expect(
      buildReceiveTransferItems(items, {
        ti_1: { receivedQty: 'abc', damagedQty: '0' },
        ti_2: { receivedQty: '2', damagedQty: '0' },
      })
    ).toMatchObject({ error: expect.stringMatching(/non-negatif|bilangan/i) });
  });

  it('uses defaults when a line has no draft entry', () => {
    const result = buildReceiveTransferItems(
      [{ id: 'ti_x', sentQty: 7, requestedQty: 7 }],
      {}
    );
    expect(result).toEqual({
      items: [{ itemId: 'ti_x', receivedQty: 7 }],
    });
  });
});
