import { catalogValidation } from '@tokoboss/application';
import type { PurchaseOrderWithItems } from '@tokoboss/application';
import type { DatabaseHandle, Transaction } from '../db';
import {
  catalogPurchaseOrderItems,
  catalogPurchaseOrders,
} from '../schema/index';
import { toPurchaseOrder, toPurchaseOrderItem } from './purchase-order-mappers';

/**
 * Draft purchase order helpers (UTA-146 Slice 1d / Story 11 — draft only).
 * Used by `DrizzleCatalogStore.createPurchaseOrderDraft`.
 */
export interface PurchaseOrderDraftInput {
  workspaceId: string;
  referenceNum: string;
  supplierName?: string | null;
  notes?: string | null;
  items: Array<{
    variantId: string;
    quantity: number;
    unitCostCents?: number | null;
  }>;
}

/** Throws `catalogValidation` for empty items, bad quantity, or bad cost. */
export function assertPurchaseOrderDraftItems(
  items: PurchaseOrderDraftInput['items']
): void {
  if (items.length === 0) {
    throw catalogValidation('A draft purchase order needs at least one item.');
  }
  for (const item of items) {
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
  }
}

/** Inserts the draft header + lines on `tx` (caller owns the transaction). */
export async function insertPurchaseOrderDraftRows(
  tx: Transaction | DatabaseHandle,
  input: PurchaseOrderDraftInput
): Promise<PurchaseOrderWithItems> {
  const insertedHeaders = await tx
    .insert(catalogPurchaseOrders)
    .values({
      workspaceId: input.workspaceId,
      referenceNum: input.referenceNum,
      status: 'draft',
      supplierName: input.supplierName ?? null,
      notes: input.notes ?? null,
      version: 1,
    })
    .returning();
  const header = insertedHeaders[0];
  if (!header) throw new Error('Failed to insert purchase order');
  const insertedItems = await tx
    .insert(catalogPurchaseOrderItems)
    .values(
      input.items.map((item) => ({
        purchaseOrderId: header.id,
        workspaceId: input.workspaceId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitCostCents: item.unitCostCents ?? null,
        version: 1,
      }))
    )
    .returning();
  return {
    purchaseOrder: toPurchaseOrder(header),
    items: insertedItems.map(toPurchaseOrderItem),
  };
}
