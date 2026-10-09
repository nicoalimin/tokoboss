/**
 * In-memory draft PO update (UTA-146 slice 1j-ii / Story 11). Mutates
 * injected Maps; full item replace + CAS. Port / store delegate later.
 */

import {
  catalogNotFound,
  catalogValidation,
  catalogVersionConflict,
} from './catalog-errors';
import type {
  CatalogVariantRecord,
  PurchaseOrderItemRecord,
  PurchaseOrderRecord,
  PurchaseOrderWithItems,
} from './catalog-types';

/** Throws catalogValidation / catalogNotFound / catalogVersionConflict. */
export function updatePurchaseOrderDraftInMem(
  state: {
    purchaseOrders: Map<string, PurchaseOrderRecord>;
    purchaseOrderItems: Map<string, PurchaseOrderItemRecord>;
    variants: Map<string, CatalogVariantRecord>;
    nextId: (prefix: string) => string;
  },
  input: {
    workspaceId: string;
    purchaseOrderId: string;
    expectedVersion: number;
    supplierName?: string | null;
    notes?: string | null;
    items: Array<{
      variantId: string;
      quantity: number;
      unitCostCents?: number | null;
    }>;
  }
): PurchaseOrderWithItems {
  if (input.items.length === 0) {
    throw catalogValidation('A draft purchase order needs at least one item.');
  }
  for (const item of input.items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw catalogValidation(
        `Quantity must be a positive integer, got ${item.quantity}`
      );
    }
    const cost = item.unitCostCents ?? null;
    if (cost !== null && (!Number.isInteger(cost) || cost < 0)) {
      throw catalogValidation(
        `Unit cost must be a non-negative integer, got ${cost}`
      );
    }
    const variant = state.variants.get(item.variantId);
    if (!variant || variant.workspaceId !== input.workspaceId) {
      throw catalogNotFound('Variant');
    }
  }

  const existing = state.purchaseOrders.get(input.purchaseOrderId);
  if (!existing || existing.workspaceId !== input.workspaceId) {
    throw catalogNotFound('PurchaseOrder');
  }
  if (existing.status !== 'draft') {
    throw catalogValidation(
      `Only draft purchase orders can be updated, got ${existing.status}`
    );
  }
  if (existing.version !== input.expectedVersion) {
    throw catalogVersionConflict(existing.version);
  }

  const now = new Date();
  const purchaseOrder: PurchaseOrderRecord = {
    ...existing,
    supplierName: input.supplierName ?? null,
    notes: input.notes ?? null,
    version: existing.version + 1,
    updatedAt: now,
  };
  state.purchaseOrders.set(purchaseOrder.id, purchaseOrder);

  for (const [id, item] of state.purchaseOrderItems) {
    if (item.purchaseOrderId === input.purchaseOrderId) {
      state.purchaseOrderItems.delete(id);
    }
  }

  const items: PurchaseOrderItemRecord[] = input.items.map((item) => {
    const row: PurchaseOrderItemRecord = {
      id: state.nextId('poi'),
      purchaseOrderId: purchaseOrder.id,
      workspaceId: input.workspaceId,
      variantId: item.variantId,
      quantity: item.quantity,
      unitCostCents: item.unitCostCents ?? null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    state.purchaseOrderItems.set(row.id, row);
    return row;
  });

  return {
    purchaseOrder: {
      ...purchaseOrder,
      createdAt: new Date(purchaseOrder.createdAt.getTime()),
      updatedAt: new Date(purchaseOrder.updatedAt.getTime()),
    },
    items: items.map((item) => ({
      ...item,
      createdAt: new Date(item.createdAt.getTime()),
      updatedAt: new Date(item.updatedAt.getTime()),
    })),
  };
}
