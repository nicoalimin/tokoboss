import { describe, expect, it } from 'vitest';
import { InMemoryCatalogStore } from '../in-memory-catalog-store';

describe('Stock Limit Enforcement in sendTransfer', () => {
  let store: InMemoryCatalogStore;

  beforeEach(() => {
    store = new InMemoryCatalogStore();
  });

  it('should enforce stock limits during sendTransfer - insufficient stock should reject', async () => {
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

    // Set up insufficient stock (only 5 items in warehouse)
    await store.adjustLevel({
      workspaceId: 'ws1',
      variantId: variant.id,
      warehouseId: warehouse1.id,
      delta: 5,
      reason: 'initial_stock',
      actorId: null,
    });

    // Create draft transfer requesting more than available
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

  it('should allow transfers when stock is sufficient', async () => {
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

    // Set up sufficient stock
    await store.adjustLevel({
      workspaceId: 'ws1',
      variantId: variant.id,
      warehouseId: warehouse1.id,
      delta: 100,
      reason: 'initial_stock',
      actorId: null,
    });

    // Create draft transfer requesting available quantity
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

    // Should succeed since there's sufficient stock
    const result = await store.sendTransfer({
      workspaceId: 'ws1',
      transferId: transfer.id,
      actorId: null,
    });

    expect(result.transfer.status).toBe('sent');
    expect(result.items[0]!.sentQty).toBe(10);
  });

  it('should allow negative stock when allowNegative is enabled', async () => {
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

    // Turn on allowNegative setting
    await store.updateStockSettings({
      workspaceId: 'ws1',
      allowNegative: true,
    });

    // Set up no stock (or negative stock)
    await store.adjustLevel({
      workspaceId: 'ws1',
      variantId: variant.id,
      warehouseId: warehouse1.id,
      delta: 0, // Start with zero stock
      reason: 'initial_stock',
      actorId: null,
    });

    // Create draft transfer requesting quantity (this should be allowed with allowNegative)
    const transfer = await store.createTransferDraft({
      workspaceId: 'ws1',
      referenceNum: 'REF-001',
      sourceWarehouseId: warehouse1.id,
      destWarehouseId: warehouse2.id,
    });

    await store.addTransferItems({
      workspaceId: 'ws1',
      transferId: transfer.id,
      items: [{ variantId: variant.id, requestedQty: 5 }],
    });

    // This should succeed even though we now have negative stock
    const result = await store.sendTransfer({
      workspaceId: 'ws1',
      transferId: transfer.id,
      actorId: null,
    });

    expect(result.transfer.status).toBe('sent');
    expect(result.items[0]!.sentQty).toBe(5);
  });
});
