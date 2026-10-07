import { describe, expect, it } from 'vitest';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import { InMemoryCatalogStore } from '../in-memory-catalog-store';
import { createProduct } from '../catalog-use-cases';
import { createPurchaseOrderDraft } from '../purchase-order-draft-use-cases';

function member(
  workspaceId: string,
  role: WorkspaceContext['role']
): WorkspaceContext {
  return {
    workspaceId,
    userId: `user_${role}_1`,
    role,
    warehouseScope: null,
    status: 'active',
    authVersion: 1,
  };
}

const WS = 'ws_po_draft_1';

async function seedVariant(store: InMemoryCatalogStore) {
  const created = await createProduct(store, {
    ctx: member(WS, 'admin'),
    workspaceId: WS,
    name: 'Kaos Polos',
    unit: 'pcs',
    variants: [
      {
        skuCode: 'SKU-PO-DRAFT-1',
        name: 'Merah / M',
        sellingPriceCents: 99000,
        hppCents: 45000,
        costSource: 'manual',
      },
    ],
  });
  return created.variants[0]!;
}

describe('createPurchaseOrderDraft (Story 11 / UTA-146)', () => {
  it('creates a draft with trimmed fields and null for missing cost', async () => {
    const store = new InMemoryCatalogStore();
    const variant = await seedVariant(store);

    const result = await createPurchaseOrderDraft(store, {
      ctx: member(WS, 'manager'),
      workspaceId: WS,
      referenceNum: '  PO-0001  ',
      supplierName: '  CV Maju  ',
      notes: '   ',
      items: [{ variantId: variant.id, quantity: 12 }],
    });

    expect(result.purchaseOrder.referenceNum).toBe('PO-0001');
    expect(result.purchaseOrder.supplierName).toBe('CV Maju');
    expect(result.purchaseOrder.notes).toBeNull();
    expect(result.purchaseOrder.status).toBe('draft');
    expect(result.purchaseOrder.version).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.variantId).toBe(variant.id);
    expect(result.items[0]!.quantity).toBe(12);
    expect(result.items[0]!.unitCostCents).toBeNull();
  });

  it('rejects staff and cross-workspace callers with TENANCY_FORBIDDEN', async () => {
    const store = new InMemoryCatalogStore();
    const variant = await seedVariant(store);
    const items = [{ variantId: variant.id, quantity: 1 }];

    await expect(
      createPurchaseOrderDraft(store, {
        ctx: member(WS, 'staff'),
        workspaceId: WS,
        referenceNum: 'PO-0002',
        items,
      })
    ).rejects.toMatchObject({ code: 'TENANCY_FORBIDDEN' });

    await expect(
      createPurchaseOrderDraft(store, {
        ctx: member('ws_other_1', 'admin'),
        workspaceId: WS,
        referenceNum: 'PO-0002',
        items,
      })
    ).rejects.toMatchObject({ code: 'TENANCY_FORBIDDEN' });
  });

  it('rejects a blank referenceNum and an empty item list', async () => {
    const store = new InMemoryCatalogStore();
    const variant = await seedVariant(store);
    const ctx = member(WS, 'admin');

    await expect(
      createPurchaseOrderDraft(store, {
        ctx,
        workspaceId: WS,
        referenceNum: '   ',
        items: [{ variantId: variant.id, quantity: 1 }],
      })
    ).rejects.toMatchObject({ code: 'CATALOG_VALIDATION' });

    await expect(
      createPurchaseOrderDraft(store, {
        ctx,
        workspaceId: WS,
        referenceNum: 'PO-0003',
        items: [],
      })
    ).rejects.toMatchObject({ code: 'CATALOG_VALIDATION' });
  });

  it('passes through the store conflict on a duplicate referenceNum', async () => {
    const store = new InMemoryCatalogStore();
    const variant = await seedVariant(store);
    const ctx = member(WS, 'admin');
    const input = {
      ctx,
      workspaceId: WS,
      referenceNum: 'PO-0004',
      items: [{ variantId: variant.id, quantity: 2, unitCostCents: 45000 }],
    };

    await createPurchaseOrderDraft(store, input);

    await expect(createPurchaseOrderDraft(store, input)).rejects.toMatchObject({
      code: 'CATALOG_CONFLICT',
    });
  });
});
