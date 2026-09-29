import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb } from '../src/db';
import { DrizzleCatalogStore } from '../src/repositories/drizzle-catalog-repository';

describe('DrizzleCatalogStore - Transfer Receive', () => {
  let db: any;
  let store: DrizzleCatalogStore;

  beforeEach(() => {
    // Create a mock database
    db = {
      transaction: vi.fn(),
      select: vi.fn(),
      update: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(),
    };
    store = new DrizzleCatalogStore(db);
  });

  it('should throw an error when transfer is not found', async () => {
    db.select.mockResolvedValue([]);

    await expect(
      store.receiveTransfer({
        workspaceId: 'workspace-1',
        transferId: 'transfer-1',
        actorId: null,
      })
    ).rejects.toThrow('Transfer');
  });

  it('should throw an error when transfer is not sent', async () => {
    db.select.mockResolvedValue([
      {
        id: 'transfer-1',
        workspaceId: 'workspace-1',
        referenceNum: 'REF001',
        sourceWarehouseId: 'warehouse-1',
        destWarehouseId: 'warehouse-2',
        status: 'draft',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await expect(
      store.receiveTransfer({
        workspaceId: 'workspace-1',
        transferId: 'transfer-1',
        actorId: null,
      })
    ).rejects.toThrow('Only sent transfers can be received');
  });

  it('should receive a complete transfer with default values', async () => {
    // Mock transfer data
    const transferData = {
      id: 'transfer-1',
      workspaceId: 'workspace-1',
      referenceNum: 'REF001',
      sourceWarehouseId: 'warehouse-1',
      destWarehouseId: 'warehouse-2',
      status: 'sent',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Mock transfer items
    const itemData = [
      {
        id: 'item-1',
        transferId: 'transfer-1',
        workspaceId: 'workspace-1',
        variantId: 'variant-1',
        requestedQty: 10,
        sentQty: 10,
        receivedQty: 0,
        damagedQty: 0,
        version: 1,
      },
    ];

    // Mock stock settings
    const stockSettings = {
      workspaceId: 'workspace-1',
      allowNegative: false,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    db.select.mockResolvedValueOnce([transferData]);
    db.select.mockResolvedValueOnce([itemData[0]]);

    // Mock getStockSettings
    db.select.mockResolvedValue([stockSettings]);

    // Mock adjustLevel calls
    const adjustLevelSpy = vi.spyOn(store, 'adjustLevel');
    adjustLevelSpy.mockResolvedValue({
      level: {
        id: 'level-1',
        workspaceId: 'workspace-1',
        variantId: 'variant-1',
        warehouseId: 'warehouse-2',
        qty: 10,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      entry: {
        id: 'ledger-1',
        workspaceId: 'workspace-1',
        variantId: 'variant-1',
        warehouseId: 'warehouse-2',
        delta: 10,
        balanceAfter: 10,
        reason: 'transfer_receive',
        actorId: null,
        correlationId: 'transfer-1',
        idempotencyKey: null,
        createdAt: new Date(),
      },
    });

    // Mock update item
    db.update.mockResolvedValue([
      {
        ...itemData[0],
        receivedQty: 10,
        version: 2,
        updatedAt: new Date(),
      },
    ]);

    // Mock update transfer
    db.update.mockResolvedValue([
      {
        ...transferData,
        status: 'completed',
        version: 2,
        updatedAt: new Date(),
      },
    ]);

    const result = await store.receiveTransfer({
      workspaceId: 'workspace-1',
      transferId: 'transfer-1',
      actorId: null,
    });

    expect(result).toBeDefined();
    expect(result.transfer.status).toBe('completed');
    expect(adjustLevelSpy).toHaveBeenCalled();
  });
});
