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
    it('sends a draft transfer with items, adjusts stock and updates status', async () => {
      // Setup
      const warehouse1 = await store.createWarehouse({
        workspaceId: 'ws1',
        code: 'WH1',
        name: 'Warehouse 1',
      });
      const warehouse2 = await store.createWarehouse({
        workspaceId: 'ws1',
        code: 'WH2',
        name: 'Warehouse 2',
      });

      const product = await store.createProductWithVariants({
        workspaceId: 'ws1',
        name: 'Test Product',
        description: null,
        unit: 'pcs',
        pictures: [],
        variants: [
          {
            skuCode: 'SKU-001',
            name: 'Product Variant 1',
            barcode: '123456789',
            sellingPriceCents: 100,
            hppCents: 50,
            costSource: 'supplier',
          },
        ],
      });

      const variant = product.variants[0]!;

      await store.adjustLevel({
        workspaceId: 'ws1',
        variantId: variant.id,
        warehouseId: warehouse1.id,
        delta: 10,
        reason: 'initial_stock',
        actorId: null,
      });

      const draft = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'TRF-SEND-001',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      await store.addTransferItems({
        workspaceId: 'ws1',
        transferId: draft.id,
        items: [{ variantId: variant.id, requestedQty: 5 }],
      });

      // Execute
      const sent = await store.sendTransfer({
        workspaceId: 'ws1',
        transferId: draft.id,
        actorId: null,
      });

      // Verify
      expect(sent.transfer.status).toBe('sent');
      expect(sent.transfer.version).toBe(2);
      expect(sent.items[0]?.sentQty).toBe(5);
      expect(sent.items[0]?.version).toBe(2);

      const sourceLevel = await store.getLevel(
        'ws1',
        variant.id,
        warehouse1.id
      );
      expect(sourceLevel?.qty).toBe(5);

      const ledger = await store.listLedgerByVariant('ws1', variant.id, 100);
      expect(
        ledger.some(
          (entry) =>
            entry.reason === 'transfer_send' &&
            entry.correlationId === draft.id &&
            entry.delta === -5
        )
      ).toBe(true);
    });

    it('fails for non-draft transfers', async () => {
      // Setup
      const warehouse1 = await store.createWarehouse({
        workspaceId: 'ws1',
        code: 'WH1',
        name: 'Warehouse 1',
      });
      const warehouse2 = await store.createWarehouse({
        workspaceId: 'ws1',
        code: 'WH2',
        name: 'Warehouse 2',
      });

      const product = await store.createProductWithVariants({
        workspaceId: 'ws1',
        name: 'Test Product',
        description: null,
        unit: 'pcs',
        pictures: [],
        variants: [
          {
            skuCode: 'SKU-001',
            name: 'Product Variant 1',
            barcode: '123456789',
            sellingPriceCents: 100,
            hppCents: 50,
            costSource: 'supplier',
          },
        ],
      });

      const variant = product.variants[0]!;

      await store.adjustLevel({
        workspaceId: 'ws1',
        variantId: variant.id,
        warehouseId: warehouse1.id,
        delta: 10,
        reason: 'initial_stock',
        actorId: null,
      });

      const draft = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'TRF-SEND-002',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      // Send it first
      await store.addTransferItems({
        workspaceId: 'ws1',
        transferId: draft.id,
        items: [{ variantId: variant.id, requestedQty: 5 }],
      });

      await store.sendTransfer({
        workspaceId: 'ws1',
        transferId: draft.id,
        actorId: null,
      });

      // Try to send again - should fail
      await expect(
        store.sendTransfer({
          workspaceId: 'ws1',
          transferId: draft.id,
          actorId: null,
        })
      ).rejects.toThrow('Only draft transfers can be sent.');
    });

    it('fails for invalid version', async () => {
      // Setup
      const warehouse1 = await store.createWarehouse({
        workspaceId: 'ws1',
        code: 'WH1',
        name: 'Warehouse 1',
      });
      const warehouse2 = await store.createWarehouse({
        workspaceId: 'ws1',
        code: 'WH2',
        name: 'Warehouse 2',
      });

      const product = await store.createProductWithVariants({
        workspaceId: 'ws1',
        name: 'Test Product',
        description: null,
        unit: 'pcs',
        pictures: [],
        variants: [
          {
            skuCode: 'SKU-001',
            name: 'Product Variant 1',
            barcode: '123456789',
            sellingPriceCents: 100,
            hppCents: 50,
            costSource: 'supplier',
          },
        ],
      });

      const variant = product.variants[0]!;

      await store.adjustLevel({
        workspaceId: 'ws1',
        variantId: variant.id,
        warehouseId: warehouse1.id,
        delta: 10,
        reason: 'initial_stock',
        actorId: null,
      });

      const draft = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'TRF-SEND-003',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      await store.addTransferItems({
        workspaceId: 'ws1',
        transferId: draft.id,
        items: [{ variantId: variant.id, requestedQty: 5 }],
      });

      // Try with wrong version
      await expect(
        store.sendTransfer({
          workspaceId: 'ws1',
          transferId: draft.id,
          actorId: null,
          expectedVersion: 5, // Wrong version
        })
      ).rejects.toThrow('This record changed. Reload and try again.');
    });

    it('fails for insufficient stock', async () => {
      // Setup
      const warehouse1 = await store.createWarehouse({
        workspaceId: 'ws1',
        code: 'WH1',
        name: 'Warehouse 1',
      });
      const warehouse2 = await store.createWarehouse({
        workspaceId: 'ws1',
        code: 'WH2',
        name: 'Warehouse 2',
      });

      const product = await store.createProductWithVariants({
        workspaceId: 'ws1',
        name: 'Test Product',
        description: null,
        unit: 'pcs',
        pictures: [],
        variants: [
          {
            skuCode: 'SKU-001',
            name: 'Product Variant 1',
            barcode: '123456789',
            sellingPriceCents: 100,
            hppCents: 50,
            costSource: 'supplier',
          },
        ],
      });

      const variant = product.variants[0]!;

      await store.adjustLevel({
        workspaceId: 'ws1',
        variantId: variant.id,
        warehouseId: warehouse1.id,
        delta: 5, // Only 5 in stock
        reason: 'initial_stock',
        actorId: null,
      });

      const draft = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'TRF-SEND-004',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      await store.addTransferItems({
        workspaceId: 'ws1',
        transferId: draft.id,
        items: [{ variantId: variant.id, requestedQty: 10 }], // Need 10 but only have 5
      });

      // Should reject due to insufficient stock
      await expect(
        store.sendTransfer({
          workspaceId: 'ws1',
          transferId: draft.id,
          actorId: null,
        })
      ).rejects.toThrow('Insufficient stock for adjustment.');
    });

    it('fails gracefully when no items exist', async () => {
      const warehouse1 = await store.createWarehouse({
        workspaceId: 'ws1',
        code: 'WH1',
        name: 'Warehouse 1',
      });
      const warehouse2 = await store.createWarehouse({
        workspaceId: 'ws1',
        code: 'WH2',
        name: 'Warehouse 2',
      });

      const draft = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'TRF-SEND-005',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      await expect(
        store.sendTransfer({
          workspaceId: 'ws1',
          transferId: draft.id,
          actorId: null,
        })
      ).rejects.toThrow('Cannot send a transfer with no items.');
    });

    it('handles idempotency keys correctly', async () => {
      // Setup
      const warehouse1 = await store.createWarehouse({
        workspaceId: 'ws1',
        code: 'WH1',
        name: 'Warehouse 1',
      });
      const warehouse2 = await store.createWarehouse({
        workspaceId: 'ws1',
        code: 'WH2',
        name: 'Warehouse 2',
      });

      const product = await store.createProductWithVariants({
        workspaceId: 'ws1',
        name: 'Test Product',
        description: null,
        unit: 'pcs',
        pictures: [],
        variants: [
          {
            skuCode: 'SKU-001',
            name: 'Product Variant 1',
            barcode: '123456789',
            sellingPriceCents: 100,
            hppCents: 50,
            costSource: 'supplier',
          },
        ],
      });

      const variant = product.variants[0]!;

      await store.adjustLevel({
        workspaceId: 'ws1',
        variantId: variant.id,
        warehouseId: warehouse1.id,
        delta: 10,
        reason: 'initial_stock',
        actorId: null,
      });

      const draft = await store.createTransferDraft({
        workspaceId: 'ws1',
        referenceNum: 'TRF-SEND-006',
        sourceWarehouseId: warehouse1.id,
        destWarehouseId: warehouse2.id,
      });

      await store.addTransferItems({
        workspaceId: 'ws1',
        transferId: draft.id,
        items: [{ variantId: variant.id, requestedQty: 5 }],
      });

      // First send
      await store.sendTransfer({
        workspaceId: 'ws1',
        transferId: draft.id,
        actorId: null,
        idempotencyKey: 'test-key',
      });

      // Send again with same key - should not duplicate adjustment
      const result = await store.sendTransfer({
        workspaceId: 'ws1',
        transferId: draft.id,
        actorId: null,
        idempotencyKey: 'test-key',
      });

      expect(result.transfer.status).toBe('sent');
    });
  });
});
