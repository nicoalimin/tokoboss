import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryCatalogStore } from '../in-memory-catalog-store';

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
      const item = items[0]!;
      expect(item.sentQty).toBe(0);
      expect(item.receivedQty).toBe(0);
      expect(item.damagedQty).toBe(0);
      expect(item.cancellationReason).toBeNull();
      expect(item.version).toBe(1);

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
      ).rejects.toMatchObject({ code: 'CATALOG_NOT_FOUND' });

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
      ).rejects.toMatchObject({ code: 'CATALOG_VALIDATION' });

      await expect(
        store.addTransferItems({
          workspaceId: 'ws1',
          transferId: transfer.id,
          items: [{ variantId: 'var1', requestedQty: -5 }],
        })
      ).rejects.toMatchObject({ code: 'CATALOG_VALIDATION' });
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
      const ws1Transfer = ws1Transfers[0]!;
      const ws2Transfer = ws2Transfers[0]!;
      expect(ws1Transfer.referenceNum).toBe('REF-001');
      expect(ws2Transfer.referenceNum).toBe('REF-002');
    });
  });

  describe('sendTransfer', () => {
    it('happy path with positive source stock, updates status to sent and decreases ledger', async () => {
      // Setup: create warehouses and product
      const warehouse1 = await store.createWarehouse({
        workspaceId: 'ws1',
        name: 'Warehouse 1',
        code: 'WH-001',
      });

      const warehouse2 = await store.createWarehouse({
        workspaceId: 'ws1',
        name: 'Warehouse 2',
        code: 'WH-002',
      });

      const productResult = await store.createProductWithVariants({
        workspaceId: 'ws1',
        name: 'Test Product',
        description: null,
        unit: 'pcs',
        pictures: [],
        variants: [
          {
            skuCode: 'SKU-001',
            name: 'Test Variant',
            sellingPriceCents: 1000,
          },
        ],
      });

      const variant = productResult.variants[0]!;

      // Set up positive stock in source warehouse
      await store.adjustLevel({
        workspaceId: 'ws1',
        variantId: variant.id,
        warehouseId: warehouse1.id,
        delta: 100,
        reason: 'initial_stock',
      });

      // Create draft transfer
      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-001',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      // Add items to the transfer
      await store.addTransferItems({
        workspaceId: 'ws1',
        transferId: transfer.id,
        items: [{ variantId: variant.id, requestedQty: 10 }],
      });

      // Send transfer
      const result = await store.sendTransfer({
        workspaceId: 'ws1',
        transferId: transfer.id,
        actorId: null,
      });

      // Verify status is sent
      expect(result.transfer.status).toBe('sent');

      // Verify sent quantities match requested
      expect(result.items[0]!.sentQty).toBe(10);
      expect(result.items[0]!.version).toBe(2); // bumped by 1

      // Verify transfer version bumped
      expect(result.transfer.version).toBe(2); // bumped by 1

      // Check that source warehouse stock was decreased
      const level = await store.getLevel('ws1', variant.id, warehouse1.id);
      expect(level?.qty).toBe(90); // 100 - 10

      // Check ledger entries for transfer_send reason
      const ledgerEntries = await store.listLedgerByVariant(
        'ws1',
        variant.id,
        100
      );
      const transferSendEntries = ledgerEntries.filter(
        (entry) => entry.reason === 'transfer_send'
      );
      expect(transferSendEntries).toHaveLength(1);
      expect(transferSendEntries[0]!.delta).toBe(-10);
      expect(transferSendEntries[0]!.correlationId).toBe(transfer.id);
    });

    it('empty items rejects with validation error', async () => {
      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-001',
        sourceWarehouseId: 'wh1',
        destWarehouseId: 'wh2',
      });

      await expect(
        store.sendTransfer({
          workspaceId: 'ws1',
          transferId: transfer.id,
          actorId: null,
        })
      ).rejects.toThrow('Cannot send a transfer with no items.');
    });

    it('non-draft transfer rejects with conflict error', async () => {
      // Setup: create warehouses and product
      const warehouse1 = await store.createWarehouse({
        workspaceId: 'ws1',
        name: 'Warehouse 1',
        code: 'WH-001',
      });

      const warehouse2 = await store.createWarehouse({
        workspaceId: 'ws1',
        name: 'Warehouse 2',
        code: 'WH-002',
      });

      const productResult = await store.createProductWithVariants({
        workspaceId: 'ws1',
        name: 'Test Product',
        description: null,
        unit: 'pcs',
        pictures: [],
        variants: [
          {
            skuCode: 'SKU-001',
            name: 'Test Variant',
            sellingPriceCents: 1000,
          },
        ],
      });

      const variant = productResult.variants[0]!;

      // Set up positive stock in source warehouse
      await store.adjustLevel({
        workspaceId: 'ws1',
        variantId: variant.id,
        warehouseId: warehouse1.id,
        delta: 100,
        reason: 'initial_stock',
      });

      // Create draft transfer and add items
      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-001',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      await store.addTransferItems({
        workspaceId: 'ws1',
        transferId: transfer.id,
        items: [{ variantId: variant.id, requestedQty: 10 }],
      });

      // Manually change status to sent
      const updatedTransfer = {
        ...transfer,
        status: 'sent',
        version: 2,
      };
      store.transfers.set(transfer.id, updatedTransfer);

      await expect(
        store.sendTransfer({
          workspaceId: 'ws1',
          transferId: transfer.id,
          actorId: null,
        })
      ).rejects.toThrow('Only draft transfers can be sent.');
    });

    it('unknown transfer / wrong workspace rejects with not found error', async () => {
      await expect(
        store.sendTransfer({
          workspaceId: 'ws1',
          transferId: 'nonexistent',
          actorId: null,
        })
      ).rejects.toThrow('Transfer not found.');

      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-001',
        sourceWarehouseId: 'wh1',
        destWarehouseId: 'wh2',
      });

      // Try with wrong workspace
      await expect(
        store.sendTransfer({
          workspaceId: 'ws2',
          transferId: transfer.id,
          actorId: null,
        })
      ).rejects.toThrow('Transfer not found.');
    });

    it('insufficient source stock with allowNegative: false rejects with insufficient stock error', async () => {
      const warehouse1 = await store.createWarehouse({
        workspaceId: 'ws1',
        name: 'Warehouse 1',
        code: 'WH-001',
      });

      const warehouse2 = await store.createWarehouse({
        workspaceId: 'ws1',
        name: 'Warehouse 2',
        code: 'WH-002',
      });

      const productResult = await store.createProductWithVariants({
        workspaceId: 'ws1',
        name: 'Test Product',
        description: null,
        unit: 'pcs',
        pictures: [],
        variants: [
          {
            skuCode: 'SKU-001',
            name: 'Test Variant',
            sellingPriceCents: 1000,
          },
        ],
      });

      const variant = productResult.variants[0]!;

      // Set up insufficient stock in source warehouse
      await store.adjustLevel({
        workspaceId: 'ws1',
        variantId: variant.id,
        warehouseId: warehouse1.id,
        delta: 5,
        reason: 'initial_stock',
      });

      // Create draft transfer
      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-001',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      await store.addTransferItems({
        workspaceId: 'ws1',
        transferId: transfer.id,
        items: [{ variantId: variant.id, requestedQty: 10 }],
      });

      // Should reject due to insufficient stock
      await expect(
        store.sendTransfer({
          workspaceId: 'ws1',
          transferId: transfer.id,
          actorId: null,
        })
      ).rejects.toThrow('Insufficient stock for adjustment.');
    });

    it('expectedVersion mismatch rejects with version conflict error', async () => {
      // Setup: create warehouses and product
      const warehouse1 = await store.createWarehouse({
        workspaceId: 'ws1',
        name: 'Warehouse 1',
        code: 'WH-001',
      });

      const warehouse2 = await store.createWarehouse({
        workspaceId: 'ws1',
        name: 'Warehouse 2',
        code: 'WH-002',
      });

      const productResult = await store.createProductWithVariants({
        workspaceId: 'ws1',
        name: 'Test Product',
        description: null,
        unit: 'pcs',
        pictures: [],
        variants: [
          {
            skuCode: 'SKU-001',
            name: 'Test Variant',
            sellingPriceCents: 1000,
          },
        ],
      });

      const variant = productResult.variants[0]!;

      // Set up positive stock in source warehouse
      await store.adjustLevel({
        workspaceId: 'ws1',
        variantId: variant.id,
        warehouseId: warehouse1.id,
        delta: 100,
        reason: 'initial_stock',
      });

      // Create draft transfer
      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-001',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      await store.addTransferItems({
        workspaceId: 'ws1',
        transferId: transfer.id,
        items: [{ variantId: variant.id, requestedQty: 10 }],
      });

      // Try with wrong expectedVersion
      await expect(
        store.sendTransfer({
          workspaceId: 'ws1',
          transferId: transfer.id,
          actorId: null,
          expectedVersion: 5, // Wrong version
        })
      ).rejects.toThrow('This record changed. Reload and try again.');
    });
  });
});
