import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryCatalogStore } from '../in-memory-catalog-store';

describe('TransferStore receiveTransfer', () => {
  let store: InMemoryCatalogStore;

  beforeEach(() => {
    store = new InMemoryCatalogStore();
  });

  describe('receiveTransfer basic functionality', () => {
    it('happy path with positive source stock, updates status to received and increases ledger', async () => {
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
      const sentResult = await store.sendTransfer({
        workspaceId: 'ws1',
        transferId: transfer.id,
        actorId: null,
      });

      // Verify that the transfer is now in 'sent' status
      expect(sentResult.transfer.status).toBe('sent');

      // Receive the transfer completely
      const result = await store.receiveTransfer({
        workspaceId: 'ws1',
        transferId: transfer.id,
        actorId: null,
      });

      // Verify status is received
      expect(result.transfer.status).toBe('received');

      // Verify received quantities match requested
      expect(result.items[0]!.receivedQty).toBe(10);
      expect(result.items[0]!.version).toBe(3); // send + receive each bump by 1

      // Verify transfer version bumped
      expect(result.transfer.version).toBe(3); // sent + receive = 2, then send bumps to 3

      // Check that destination warehouse stock was increased
      const level = await store.getLevel('ws1', variant.id, warehouse2.id);
      expect(level?.qty).toBe(10); // 0 + 10

      // Check ledger entries for transfer_receive reason
      const ledgerEntries = await store.listLedgerByVariant(
        'ws1',
        variant.id,
        100
      );
      const transferReceiveEntries = ledgerEntries.filter(
        (entry) => entry.reason === 'transfer_receive'
      );
      expect(transferReceiveEntries).toHaveLength(1);
      expect(transferReceiveEntries[0]!.delta).toBe(10);
      expect(transferReceiveEntries[0]!.correlationId).toBe(transfer.id);
    });

    it('partial item receive with specific items array', async () => {
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
        items: [
          { variantId: variant.id, requestedQty: 10 },
          { variantId: variant.id, requestedQty: 15 },
        ],
      });

      // Send transfer
      const sentResult = await store.sendTransfer({
        workspaceId: 'ws1',
        transferId: transfer.id,
        actorId: null,
      });

      // Receive only first item (partial)
      const result = await store.receiveTransfer({
        workspaceId: 'ws1',
        transferId: transfer.id,
        actorId: null,
        items: [
          {
            itemId: sentResult.items[0]!.id,
            receivedQty: 5,
            damagedQty: 2,
          },
        ],
      });

      // Verify only first item was updated
      expect(result.items[0]!.receivedQty).toBe(5);
      expect(result.items[0]!.damagedQty).toBe(2);

      expect(result.items[1]!.receivedQty).toBe(0);
      expect(result.items[1]!.damagedQty).toBe(0);

      // Verify transfer is still in 'sent' status (not complete)
      expect(result.transfer.status).toBe('sent');

      // Check that only the received quantity increased
      const level = await store.getLevel('ws1', variant.id, warehouse2.id);
      expect(level?.qty).toBe(5); // only the 5 good units enter stock
    });

    it('rejects when transfer is not in sent status', async () => {
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

      // Create draft transfer without sending it
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

      // Should reject with conflict error
      await expect(
        store.receiveTransfer({
          workspaceId: 'ws1',
          transferId: transfer.id,
          actorId: null,
        })
      ).rejects.toThrow('Only sent transfers can be received.');
    });
  });

  describe('receiveTransfer validation', () => {
    it('rejects with validation error for negative quantities in items', async () => {
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

      // Create draft transfer and send it
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

      const sentResult = await store.sendTransfer({
        workspaceId: 'ws1',
        transferId: transfer.id,
        actorId: null,
      });

      // Try with negative received quantity
      await expect(
        store.receiveTransfer({
          workspaceId: 'ws1',
          transferId: transfer.id,
          actorId: null,
          items: [
            {
              itemId: sentResult.items[0]!.id,
              receivedQty: -5,
            },
          ],
        })
      ).rejects.toThrow(
        'Received and damaged quantities must be non-negative.'
      );
    });

    it('rejects when items exceed remaining quantity', async () => {
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

      // Create draft transfer and send it
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

      const sentResult = await store.sendTransfer({
        workspaceId: 'ws1',
        transferId: transfer.id,
        actorId: null,
      });

      // Try to exceed the remaining quantity
      await expect(
        store.receiveTransfer({
          workspaceId: 'ws1',
          transferId: transfer.id,
          actorId: null,
          items: [
            {
              itemId: sentResult.items[0]!.id,
              receivedQty: 15, // exceeds the remaining 10 qty
            },
          ],
        })
      ).rejects.toThrow(
        'Received and damaged quantities cannot exceed remaining quantity.'
      );
    });
  });
});
