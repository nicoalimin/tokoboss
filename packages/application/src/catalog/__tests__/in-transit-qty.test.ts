import { describe, expect, it } from 'vitest';
import type {
  TransferItemRecord,
  TransferStatus,
  TransferWithItems,
} from '../catalog-types';
import { sumInTransitQtyByVariant } from '../in-transit-qty';

const at = new Date('2026-10-01T00:00:00Z');

function transfer(
  id: string,
  status: TransferStatus,
  items: Array<
    Pick<
      TransferItemRecord,
      'variantId' | 'sentQty' | 'receivedQty' | 'damagedQty'
    >
  >
): TransferWithItems {
  return {
    transfer: {
      id,
      workspaceId: 'ws_1',
      referenceNum: `TRF-${id}`,
      sourceWarehouseId: 'wh_a',
      destWarehouseId: 'wh_b',
      status,
      notes: null,
      expectedReceiveDate: null,
      version: 1,
      createdAt: at,
      updatedAt: at,
    },
    items: items.map((item, index) => ({
      id: `${id}_item_${index}`,
      transferId: id,
      workspaceId: 'ws_1',
      requestedQty: item.sentQty,
      cancellationReason: null,
      version: 1,
      createdAt: at,
      updatedAt: at,
      ...item,
    })),
  };
}

describe('sumInTransitQtyByVariant (UTA-146 slice 1e-iii)', () => {
  it('returns an empty map when there are no transfers', () => {
    expect(sumInTransitQtyByVariant([]).size).toBe(0);
  });

  it('counts only sent transfers and sums per variant', () => {
    const result = sumInTransitQtyByVariant([
      transfer('t1', 'sent', [
        { variantId: 'var_1', sentQty: 4, receivedQty: 0, damagedQty: 0 },
        { variantId: 'var_2', sentQty: 2, receivedQty: 0, damagedQty: 0 },
      ]),
      transfer('t2', 'sent', [
        { variantId: 'var_1', sentQty: 3, receivedQty: 0, damagedQty: 0 },
      ]),
      transfer('t3', 'draft', [
        { variantId: 'var_1', sentQty: 9, receivedQty: 0, damagedQty: 0 },
      ]),
      transfer('t4', 'received', [
        { variantId: 'var_1', sentQty: 5, receivedQty: 5, damagedQty: 0 },
      ]),
      transfer('t5', 'cancelled', [
        { variantId: 'var_2', sentQty: 6, receivedQty: 0, damagedQty: 0 },
      ]),
    ]);
    expect(result.get('var_1')).toBe(7);
    expect(result.get('var_2')).toBe(2);
    expect(result.size).toBe(2);
  });

  it('subtracts received and damaged units and never goes negative', () => {
    const result = sumInTransitQtyByVariant([
      transfer('t1', 'sent', [
        { variantId: 'var_1', sentQty: 10, receivedQty: 3, damagedQty: 2 },
        { variantId: 'var_2', sentQty: 4, receivedQty: 4, damagedQty: 1 },
      ]),
    ]);
    expect(result.get('var_1')).toBe(5);
    expect(result.has('var_2')).toBe(false);
  });
});
