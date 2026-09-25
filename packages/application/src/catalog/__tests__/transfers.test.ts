import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryCatalogStore } from '../in-memory-catalog-store';
import { catalogNotFound, catalogValidation } from '../catalog-errors';

describe('TransferStore', () => {
  let store: InMemoryCatalogStore;

  beforeEach(() => {
    store = new InMemoryCatalogStore();
  });

  describe('createTransferDraft', () => {
    it('creates a draft with status draft and version 1', async () => {
      const result = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-001',
        sourceWarehouseId: 'wh1',
        destWarehouseId: 'wh2',
        notes: 'Test transfer',
        expectedReceiveDate: new Date('2026-12-31'),
      });

      expect(result.status).toBe('draft');
      expect(result.version).toBe(1);
      expect(result.notes).toBe('Test transfer');
      expect(result.expectedReceiveDate?.getTime()).toBe(
        new Date('2026-12-31').getTime()
      );
    });

    it('dup referenceNum same workspace throws; same referenceNum other workspace allowed', async () => {
      await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-001',
        sourceWarehouseId: 'wh1',
        destWarehouseId: 'wh2',
      });

      await expect(
        store.createTransferDraft({
          workspaceId: 'ws1',
          referenceNum: 'REF-001',
          sourceWarehouseId: 'wh1',
          destWarehouseId: 'wh2',
        })
      ).rejects.toThrow('already exists');

      // Should allow same referenceNum in different workspace
      await expect(
        store.createTransferDraft({
          workspaceId: 'ws2',
          referenceNum: 'REF-001',
          sourceWarehouseId: 'wh1',
          destWarehouseId: 'wh2',
        })
      ).resolves.not.toThrow();
    });
  });

  describe('addTransferItems', () => {
    it('adds items with zeroed qty fields; findTransferWithItems returns them', async () => {
      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-001',
        sourceWarehouseId: 'wh1',
        destWarehouseId: 'wh2',
      });

      const items = await store.addTransferItems({
        workspaceId: 'ws1',
        transferId: transfer.id,
        items: [
          { variantId: 'var1', requestedQty: 10 },
          { variantId: 'var2', requestedQty: 5 },
        ],
      });

      expect(items).toHaveLength(2);
      expect(items[0].sentQty).toBe(0);
      expect(items[0].receivedQty).toBe(0);
      expect(items[0].damagedQty).toBe(0);
      expect(items[0].cancellationReason).toBeNull();
      expect(items[0].version).toBe(1);

      const withItems = await store.findTransferWithItems('ws1', transfer.id);
      expect(withItems).not.toBeNull();
      expect(withItems?.items).toHaveLength(2);
    });

    it('qty <= 0 and unknown transfer id rejected', async () => {
      await expect(
        store.addTransferItems({
          workspaceId: 'ws1',
          transferId: 'unknown',
          items: [{ variantId: 'var1', requestedQty: 10 }],
        })
      ).rejects.toThrow(catalogNotFound);

      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-001',
        sourceWarehouseId: 'wh1',
        destWarehouseId: 'wh2',
      });

      await expect(
        store.addTransferItems({
          workspaceId: 'ws1',
          transferId: transfer.id,
          items: [{ variantId: 'var1', requestedQty: 0 }],
        })
      ).rejects.toThrow(catalogValidation);

      await expect(
        store.addTransferItems({
          workspaceId: 'ws1',
          transferId: transfer.id,
          items: [{ variantId: 'var1', requestedQty: -5 }],
        })
      ).rejects.toThrow(catalogValidation);
    });
  });

  describe('findTransferById', () => {
    it('returns null for other workspace (tenant isolation)', async () => {
      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-001',
        sourceWarehouseId: 'wh1',
        destWarehouseId: 'wh2',
      });

      expect(await store.findTransferById('ws2', transfer.id)).toBeNull();
    });

    it('listTransfers is workspace-scoped', async () => {
      await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-001',
        sourceWarehouseId: 'wh1',
        destWarehouseId: 'wh2',
      });

      await store.createTransferDraft({
        workspaceId: 'ws2',
        referenceNum: 'REF-002',
        sourceWarehouseId: 'wh1',
        destWarehouseId: 'wh2',
      });

      const ws1Transfers = await store.listTransfers('ws1');
      const ws2Transfers = await store.listTransfers('ws2');

      expect(ws1Transfers).toHaveLength(1);
      expect(ws2Transfers).toHaveLength(1);
      expect(ws1Transfers[0].referenceNum).toBe('REF-001');
      expect(ws2Transfers[0].referenceNum).toBe('REF-002');
    });
  });
});
