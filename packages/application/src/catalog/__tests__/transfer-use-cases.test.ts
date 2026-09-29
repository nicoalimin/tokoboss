import { describe, expect, it, beforeEach } from 'vitest';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import { InMemoryCatalogStore } from '../in-memory-catalog-store';
import {
  addTransferItemsUseCase,
  createTransferDraftUseCase,
  getTransferUseCase,
  listTransfersUseCase,
  sendTransferUseCase,
} from '../catalog-use-cases';

const WS = 'ws_transfer_uc_1';
const WS_OTHER = 'ws_transfer_uc_2';

function manager(workspaceId: string): WorkspaceContext {
  return {
    workspaceId,
    userId: 'user_manager_1',
    role: 'manager',
    warehouseScope: null,
    status: 'active',
    authVersion: 1,
  };
}

function staff(workspaceId: string): WorkspaceContext {
  return {
    workspaceId,
    userId: 'user_staff_1',
    role: 'staff',
    warehouseScope: null,
    status: 'active',
    authVersion: 1,
  };
}

async function seedWarehousesAndStock(store: InMemoryCatalogStore) {
  const source = await store.createWarehouse({
    workspaceId: WS,
    name: 'Source WH',
    code: 'SRC-01',
  });
  const dest = await store.createWarehouse({
    workspaceId: WS,
    name: 'Dest WH',
    code: 'DST-01',
  });
  const productResult = await store.createProductWithVariants({
    workspaceId: WS,
    name: 'Transfer Widget',
    description: null,
    unit: 'pcs',
    pictures: [],
    variants: [
      {
        skuCode: 'XFER-SKU-001',
        name: 'Default',
        sellingPriceCents: 1000,
      },
    ],
  });
  const variant = productResult.variants[0]!;
  await store.adjustLevel({
    workspaceId: WS,
    variantId: variant.id,
    warehouseId: source.id,
    delta: 100,
    reason: 'initial_stock',
    actorId: null,
  });
  return { source, dest, variant };
}

describe('transfer use-cases (UTA-121)', () => {
  let store: InMemoryCatalogStore;

  beforeEach(() => {
    store = new InMemoryCatalogStore();
  });

  it('staff cannot createTransferDraft or sendTransfer (RBAC reject)', async () => {
    const { source, dest, variant } = await seedWarehousesAndStock(store);

    await expect(
      createTransferDraftUseCase(store, {
        ctx: staff(WS),
        workspaceId: WS,
        referenceNum: 'REF-STAFF',
        sourceWarehouseId: source.id,
        destWarehouseId: dest.id,
      })
    ).rejects.toMatchObject({ code: 'TENANCY_FORBIDDEN' });

    const draft = await createTransferDraftUseCase(store, {
      ctx: manager(WS),
      workspaceId: WS,
      referenceNum: 'REF-MGR',
      sourceWarehouseId: source.id,
      destWarehouseId: dest.id,
    });
    await addTransferItemsUseCase(store, {
      ctx: manager(WS),
      workspaceId: WS,
      transferId: draft.id,
      items: [{ variantId: variant.id, requestedQty: 5 }],
    });

    await expect(
      sendTransferUseCase(store, {
        ctx: staff(WS),
        workspaceId: WS,
        transferId: draft.id,
      })
    ).rejects.toMatchObject({ code: 'TENANCY_FORBIDDEN' });
  });

  it('manager can create draft + add items + send → status sent; source stock decreased', async () => {
    const { source, dest, variant } = await seedWarehousesAndStock(store);

    const draft = await createTransferDraftUseCase(store, {
      ctx: manager(WS),
      workspaceId: WS,
      referenceNum: 'REF-HAPPY',
      sourceWarehouseId: source.id,
      destWarehouseId: dest.id,
      notes: 'happy path',
    });
    expect(draft.status).toBe('draft');

    const items = await addTransferItemsUseCase(store, {
      ctx: manager(WS),
      workspaceId: WS,
      transferId: draft.id,
      items: [{ variantId: variant.id, requestedQty: 10 }],
    });
    expect(items).toHaveLength(1);

    const sent = await sendTransferUseCase(store, {
      ctx: manager(WS),
      workspaceId: WS,
      transferId: draft.id,
    });
    expect(sent.transfer.status).toBe('sent');
    expect(sent.items[0]!.sentQty).toBe(10);

    const level = await store.getLevel(WS, variant.id, source.id);
    expect(level?.qty).toBe(90);
  });

  it('same-warehouse draft rejected with validation', async () => {
    const { source } = await seedWarehousesAndStock(store);

    await expect(
      createTransferDraftUseCase(store, {
        ctx: manager(WS),
        workspaceId: WS,
        referenceNum: 'REF-SAME',
        sourceWarehouseId: source.id,
        destWarehouseId: source.id,
      })
    ).rejects.toMatchObject({
      code: 'CATALOG_VALIDATION',
      message: expect.stringMatching(/same warehouse/i),
    });
  });

  it('getTransfer wrong workspace / unknown id → not found', async () => {
    const { source, dest } = await seedWarehousesAndStock(store);
    const draft = await createTransferDraftUseCase(store, {
      ctx: manager(WS),
      workspaceId: WS,
      referenceNum: 'REF-GET',
      sourceWarehouseId: source.id,
      destWarehouseId: dest.id,
    });

    await expect(
      getTransferUseCase(store, {
        ctx: manager(WS_OTHER),
        workspaceId: WS_OTHER,
        transferId: draft.id,
      })
    ).rejects.toMatchObject({ code: 'CATALOG_NOT_FOUND' });

    await expect(
      getTransferUseCase(store, {
        ctx: manager(WS),
        workspaceId: WS,
        transferId: 'xfer_missing',
      })
    ).rejects.toMatchObject({ code: 'CATALOG_NOT_FOUND' });
  });

  it('listTransfers workspace-scoped (other tenant empty)', async () => {
    const { source, dest } = await seedWarehousesAndStock(store);
    await createTransferDraftUseCase(store, {
      ctx: manager(WS),
      workspaceId: WS,
      referenceNum: 'REF-LIST',
      sourceWarehouseId: source.id,
      destWarehouseId: dest.id,
    });

    const mine = await listTransfersUseCase(store, {
      ctx: manager(WS),
      workspaceId: WS,
    });
    expect(mine).toHaveLength(1);
    expect(mine[0]!.transfer.referenceNum).toBe('REF-LIST');

    const other = await listTransfersUseCase(store, {
      ctx: manager(WS_OTHER),
      workspaceId: WS_OTHER,
    });
    expect(other).toHaveLength(0);
  });

  it('sendTransfer expectedVersion mismatch surfaces store version conflict', async () => {
    const { source, dest, variant } = await seedWarehousesAndStock(store);
    const draft = await createTransferDraftUseCase(store, {
      ctx: manager(WS),
      workspaceId: WS,
      referenceNum: 'REF-VER',
      sourceWarehouseId: source.id,
      destWarehouseId: dest.id,
    });
    await addTransferItemsUseCase(store, {
      ctx: manager(WS),
      workspaceId: WS,
      transferId: draft.id,
      items: [{ variantId: variant.id, requestedQty: 3 }],
    });

    await expect(
      sendTransferUseCase(store, {
        ctx: manager(WS),
        workspaceId: WS,
        transferId: draft.id,
        expectedVersion: draft.version + 99,
      })
    ).rejects.toMatchObject({ code: 'CATALOG_VERSION_CONFLICT' });
  });
});
