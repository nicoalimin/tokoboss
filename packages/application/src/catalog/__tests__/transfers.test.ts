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
        actorId: null,
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
        actorId: null,
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

      // Send once so the transfer is no longer a draft.
      await store.sendTransfer({
        workspaceId: 'ws1',
        transferId: transfer.id,
        actorId: null,
      });

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
        actorId: null,
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
        actorId: null,
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
  describe('receiveTransfer', () => {
    it('full receive (omit items) marks received, credits dest, and writes transfer_receive ledger', async () => {
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

      await store.adjustLevel({
        workspaceId: 'ws1',
        variantId: variant.id,
        warehouseId: warehouse1.id,
        delta: 100,
        reason: 'initial_stock',
        actorId: null,
      });

      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-RECV-001',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      await store.addTransferItems({
        workspaceId: 'ws1',
        transferId: transfer.id,
        items: [{ variantId: variant.id, requestedQty: 10 }],
      });

      await store.sendTransfer({
        workspaceId: 'ws1',
        transferId: transfer.id,
        actorId: null,
      });

      const result = await store.receiveTransfer({
        workspaceId: 'ws1',
        transferId: transfer.id,
        actorId: null,
      });

      expect(result.transfer.status).toBe('received');
      expect(result.items[0]!.receivedQty).toBe(result.items[0]!.sentQty);
      expect(result.items[0]!.sentQty).toBe(10);

      const destLevel = await store.getLevel('ws1', variant.id, warehouse2.id);
      expect(destLevel?.qty).toBe(10);

      const ledgerEntries = await store.listLedgerByVariant(
        'ws1',
        variant.id,
        100
      );
      const receiveEntries = ledgerEntries.filter(
        (entry) => entry.reason === 'transfer_receive'
      );
      expect(receiveEntries).toHaveLength(1);
      expect(receiveEntries[0]!.delta).toBe(10);
      expect(receiveEntries[0]!.correlationId).toBe(transfer.id);
    });

    it('partial receive with items array processes correctly', async () => {
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

      await store.adjustLevel({
        workspaceId: 'ws1',
        variantId: variant.id,
        warehouseId: warehouse1.id,
        delta: 100,
        reason: 'initial_stock',
        actorId: null,
      });

      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-RECV-002',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      const items = await store.addTransferItems({
        workspaceId: 'ws1',
        transferId: transfer.id,
        items: [{ variantId: variant.id, requestedQty: 10 }],
      });

      await store.sendTransfer({
        workspaceId: 'ws1',
        transferId: transfer.id,
        actorId: null,
      });

      const result = await store.receiveTransfer({
        workspaceId: 'ws1',
        transferId: transfer.id,
        actorId: null,
        items: [
          {
            itemId: items[0]!.id,
            receivedQty: 5,
            damagedQty: 2,
          },
        ],
      });

      expect(result.transfer.status).toBe('sent'); // not all received yet
      expect(result.items[0]!.receivedQty).toBe(5);
      expect(result.items[0]!.damagedQty).toBe(2);
      expect(result.items[0]!.sentQty).toBe(10);

      const destLevel = await store.getLevel('ws1', variant.id, warehouse2.id);
      expect(destLevel?.qty).toBe(5); // only good quantity credited (not damaged)
    });

    it('non-sent transfer rejects with conflict error', async () => {
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

      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-RECV-DRAFT',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      await expect(
        store.receiveTransfer({
          workspaceId: 'ws1',
          transferId: transfer.id,
          actorId: null,
        })
      ).rejects.toThrow('Only sent transfers can be received.');
    });

    it('unknown transfer or wrong workspace rejects with not found', async () => {
      await expect(
        store.receiveTransfer({
          workspaceId: 'ws1',
          transferId: 'missing-transfer-id',
          actorId: null,
        })
      ).rejects.toThrow('Transfer');
    });

    it('rejects with not found for unknown item in items array', async () => {
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

      await store.adjustLevel({
        workspaceId: 'ws1',
        variantId: variant.id,
        warehouseId: warehouse1.id,
        delta: 100,
        reason: 'initial_stock',
        actorId: null,
      });

      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-RECV-003',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      // Add items to the transfer
      await store.addTransferItems({
        workspaceId: 'ws1',
        transferId: transfer.id,
        items: [{ variantId: variant.id, requestedQty: 10 }],
      });

      await store.sendTransfer({
        workspaceId: 'ws1',
        transferId: transfer.id,
        actorId: null,
      });

      // Try to receive using a completely fake item ID
      await expect(
        store.receiveTransfer({
          workspaceId: 'ws1',
          transferId: transfer.id,
          actorId: null,
          items: [
            {
              itemId: 'fake-item-id-which-does-not-exist',
              receivedQty: 5,
            },
          ],
        })
      ).rejects.toThrow('TransferItem not found');
    });

    it('rejects with validation if receivedQty or damagedQty < 0', async () => {
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

      await store.adjustLevel({
        workspaceId: 'ws1',
        variantId: variant.id,
        warehouseId: warehouse1.id,
        delta: 100,
        reason: 'initial_stock',
        actorId: null,
      });

      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-RECV-004',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      const items = await store.addTransferItems({
        workspaceId: 'ws1',
        transferId: transfer.id,
        items: [{ variantId: variant.id, requestedQty: 10 }],
      });

      await store.sendTransfer({
        workspaceId: 'ws1',
        transferId: transfer.id,
        actorId: null,
      });

      // Test negative received quantity
      await expect(
        store.receiveTransfer({
          workspaceId: 'ws1',
          transferId: transfer.id,
          actorId: null,
          items: [
            {
              itemId: items[0]!.id,
              receivedQty: -5,
            },
          ],
        })
      ).rejects.toThrow('Received and damaged quantities must be non-negative');

      // Test negative damaged quantity
      await expect(
        store.receiveTransfer({
          workspaceId: 'ws1',
          transferId: transfer.id,
          actorId: null,
          items: [
            {
              itemId: items[0]!.id,
              receivedQty: 5,
              damagedQty: -2,
            },
          ],
        })
      ).rejects.toThrow('Received and damaged quantities must be non-negative');
    });

    it('rejects with validation if receivedQty + damagedQty > remaining quantity', async () => {
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

      await store.adjustLevel({
        workspaceId: 'ws1',
        variantId: variant.id,
        warehouseId: warehouse1.id,
        delta: 100,
        reason: 'initial_stock',
        actorId: null,
      });

      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-RECV-005',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      const items = await store.addTransferItems({
        workspaceId: 'ws1',
        transferId: transfer.id,
        items: [{ variantId: variant.id, requestedQty: 10 }],
      });

      await store.sendTransfer({
        workspaceId: 'ws1',
        transferId: transfer.id,
        actorId: null,
      });

      // Test exceeding remaining quantity
      await expect(
        store.receiveTransfer({
          workspaceId: 'ws1',
          transferId: transfer.id,
          actorId: null,
          items: [
            {
              itemId: items[0]!.id,
              receivedQty: 7, // 7 + 4 = 11 > 10 (remaining)
              damagedQty: 4,
            },
          ],
        })
      ).rejects.toThrow('Cannot receive more than remaining sent quantity');
    });

    it('handles multiple items with different receipt quantities correctly', async () => {
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
            name: 'Test Variant 1',
            sellingPriceCents: 1000,
          },
          {
            skuCode: 'SKU-002',
            name: 'Test Variant 2',
            sellingPriceCents: 1500,
          },
        ],
      });

      const variant1 = productResult.variants[0]!;
      const variant2 = productResult.variants[1]!;

      await store.adjustLevel({
        workspaceId: 'ws1',
        variantId: variant1.id,
        warehouseId: warehouse1.id,
        delta: 100,
        reason: 'initial_stock',
        actorId: null,
      });

      await store.adjustLevel({
        workspaceId: 'ws1',
        variantId: variant2.id,
        warehouseId: warehouse1.id,
        delta: 100,
        reason: 'initial_stock',
        actorId: null,
      });

      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-RECV-006',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      const items = await store.addTransferItems({
        workspaceId: 'ws1',
        transferId: transfer.id,
        items: [
          { variantId: variant1.id, requestedQty: 10 },
          { variantId: variant2.id, requestedQty: 15 },
        ],
      });

      await store.sendTransfer({
        workspaceId: 'ws1',
        transferId: transfer.id,
        actorId: null,
      });

      // Partially receive first item, fully receive second
      const result = await store.receiveTransfer({
        workspaceId: 'ws1',
        transferId: transfer.id,
        actorId: null,
        items: [
          {
            itemId: items[0]!.id,
            receivedQty: 5,
            damagedQty: 2,
          },
          {
            itemId: items[1]!.id,
            receivedQty: 15, // full quantity
          },
        ],
      });

      expect(result.transfer.status).toBe('sent'); // not all received yet (still one item)

      const item1 = result.items.find((i) => i.id === items[0]!.id)!;
      const item2 = result.items.find((i) => i.id === items[1]!.id)!;

      expect(item1.receivedQty).toBe(5);
      expect(item1.damagedQty).toBe(2);

      expect(item2.receivedQty).toBe(15);
      expect(item2.sentQty).toBe(15);

      // Only good quantity should be credited (5 for item1, 15 for item2)
      const destLevel1 = await store.getLevel(
        'ws1',
        variant1.id,
        warehouse2.id
      );
      expect(destLevel1?.qty).toBe(5);

      const destLevel2 = await store.getLevel(
        'ws1',
        variant2.id,
        warehouse2.id
      );
      expect(destLevel2?.qty).toBe(15);
    });

    it('rejects with validation for duplicate item IDs in items array', async () => {
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

      await store.adjustLevel({
        workspaceId: 'ws1',
        variantId: variant.id,
        warehouseId: warehouse1.id,
        delta: 100,
        reason: 'initial_stock',
        actorId: null,
      });

      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-RECV-007',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      const items = await store.addTransferItems({
        workspaceId: 'ws1',
        transferId: transfer.id,
        items: [{ variantId: variant.id, requestedQty: 10 }],
      });

      await store.sendTransfer({
        workspaceId: 'ws1',
        transferId: transfer.id,
        actorId: null,
      });

      // Duplicate item ID
      await expect(
        store.receiveTransfer({
          workspaceId: 'ws1',
          transferId: transfer.id,
          actorId: null,
          items: [
            {
              itemId: items[0]!.id,
              receivedQty: 5,
            },
            {
              itemId: items[0]!.id, // duplicate ID
              receivedQty: 3,
            },
          ],
        })
      ).rejects.toThrow('Each transfer item may only be received once');
    });
  });

  describe('cancelTransfer', () => {
    it('cancels a draft transfer with items and sets cancellation reason on all items', async () => {
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

      // Create draft transfer
      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-CANCEL-001',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      // Add items to the transfer
      await store.addTransferItems({
        workspaceId: 'ws1',
        transferId: transfer.id,
        items: [{ variantId: 'var1', requestedQty: 10 }],
      });

      // Cancel the transfer
      const result = await store.cancelTransfer({
        workspaceId: 'ws1',
        transferId: transfer.id,
        actorId: null,
        cancellationReason: 'Test reason for cancellation',
      });

      // Verify transfer is cancelled
      expect(result.transfer.status).toBe('cancelled');
      expect(result.transfer.version).toBe(2); // bumped by 1 from draft version 1

      // Verify items are updated with cancellation reason and version bump
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.cancellationReason).toBe(
        'Test reason for cancellation'
      );
      expect(result.items[0]!.version).toBe(2); // bumped by 1 from initial version 1

      // Verify that the transfer is still in store with correct status
      const updatedTransfer = await store.findTransferById('ws1', transfer.id);
      expect(updatedTransfer?.status).toBe('cancelled');
    });

    it('rejects cancellation of non-draft transfers', async () => {
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

      // Create draft transfer
      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-CANCEL-002',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      // Add items to the transfer
      await store.addTransferItems({
        workspaceId: 'ws1',
        transferId: transfer.id,
        items: [{ variantId: 'var1', requestedQty: 10 }],
      });

      // Create a new transfer and make it go through send process
      // so it's not a draft anymore (but we're testing the rejection path)
      const anotherTransfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-CANCEL-003',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      // We will manually update this to a "sent" state, but we'll do it carefully
      const sentTransfer = await store.sendTransfer({
        workspaceId: 'ws1',
        transferId: anotherTransfer.id,
        actorId: null,
      });

      expect(sentTransfer.transfer.status).toBe('sent');

      // Try to cancel the sent transfer - should fail with "Only draft transfers can be cancelled"
      await expect(
        store.cancelTransfer({
          workspaceId: 'ws1',
          transferId: anotherTransfer.id,
          actorId: null,
          cancellationReason: 'Test reason for cancellation',
        })
      ).rejects.toThrow('Only draft transfers can be cancelled.');
    });

    it('rejects cancellation with empty cancellation reason', async () => {
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

      // Create draft transfer
      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-CANCEL-003',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      // Try to cancel without cancellation reason - should fail
      await expect(
        store.cancelTransfer({
          workspaceId: 'ws1',
          transferId: transfer.id,
          actorId: null,
          cancellationReason: '',
        })
      ).rejects.toThrow('Cancellation reason must be provided.');
    });

    it('rejects cancellation with null cancellation reason', async () => {
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

      // Create draft transfer
      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-CANCEL-004',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      // Try to cancel with null cancellation reason - should fail
      await expect(
        store.cancelTransfer({
          workspaceId: 'ws1',
          transferId: transfer.id,
          actorId: null,
          cancellationReason: null as any, // Intentionally passing null
        })
      ).rejects.toThrow('Cancellation reason must be provided.');
    });

    it('rejects cancellation of non-existent transfers', async () => {
      await expect(
        store.cancelTransfer({
          workspaceId: 'ws1',
          transferId: 'non-existent-id',
          actorId: null,
          cancellationReason: 'Test reason for cancellation',
        })
      ).rejects.toThrow('Transfer not found.');
    });

    it('rejects cancellation with version conflict', async () => {
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

      // Create draft transfer
      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-CANCEL-005',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      // Add items to the transfer
      await store.addTransferItems({
        workspaceId: 'ws1',
        transferId: transfer.id,
        items: [{ variantId: variant.id, requestedQty: 10 }],
      });

      // Try to cancel with wrong version - should fail
      await expect(
        store.cancelTransfer({
          workspaceId: 'ws1',
          transferId: transfer.id,
          actorId: null,
          expectedVersion: 5, // Wrong version
          cancellationReason: 'Test reason for cancellation',
        })
      ).rejects.toThrow('This record changed. Reload and try again.');
    });

    it('cancels a transfer with multiple items', async () => {
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
            name: 'Test Variant 1',
            sellingPriceCents: 1000,
          },
          {
            skuCode: 'SKU-002',
            name: 'Test Variant 2',
            sellingPriceCents: 1500,
          },
        ],
      });

      const variant1 = productResult.variants[0]!;
      const variant2 = productResult.variants[1]!;

      // Create draft transfer
      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-CANCEL-006',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      // Add multiple items to the transfer
      await store.addTransferItems({
        workspaceId: 'ws1',
        transferId: transfer.id,
        items: [
          { variantId: variant1.id, requestedQty: 10 },
          { variantId: variant2.id, requestedQty: 15 },
        ],
      });

      // Cancel the transfer
      const result = await store.cancelTransfer({
        workspaceId: 'ws1',
        transferId: transfer.id,
        actorId: null,
        cancellationReason: 'Multiple items test reason for cancellation',
      });

      // Verify transfer is cancelled
      expect(result.transfer.status).toBe('cancelled');

      // Verify all items are updated with cancellation reason and version bump
      expect(result.items).toHaveLength(2);
      result.items.forEach((item) => {
        expect(item.cancellationReason).toBe(
          'Multiple items test reason for cancellation'
        );
        expect(item.version).toBe(2); // bumped by 1 from initial version 1
      });
    });

    it('correctly handles tenant isolation during cancellation', async () => {
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

      // Create draft transfer in workspace 1
      const transfer = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'REF-CANCEL-007',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      // Add items to the transfer
      await store.addTransferItems({
        workspaceId: 'ws1',
        transferId: transfer.id,
        items: [{ variantId: 'var1', requestedQty: 10 }],
      });

      // Try to cancel transfer from wrong workspace - should fail with not found
      await expect(
        store.cancelTransfer({
          workspaceId: 'ws2', // Wrong workspace
          transferId: transfer.id,
          actorId: null,
          cancellationReason: 'Test reason for cancellation',
        })
      ).rejects.toThrow('Transfer not found.');
    });
  });
});
