import {
  catalogNotFound,
  catalogValidation,
  catalogVersionConflict,
} from '@tokoboss/application';
import type { PurchaseOrderWithItems } from '@tokoboss/application';
import { and, eq } from 'drizzle-orm';
import type { DatabaseHandle, Transaction } from '../db';
import {
  catalogPurchaseOrderItems,
  catalogPurchaseOrders,
} from '../schema/index';
import { assertPurchaseOrderDraftItems } from './purchase-order-draft-writer';
import { toPurchaseOrder, toPurchaseOrderItem } from './purchase-order-mappers';

/**
 * Draft purchase order update writer (UTA-146 slice 1j-iv / Story 11).
 * Full item replace + CAS on the header version. Caller owns the
 * transaction and checks that every variant belongs to the workspace.
 */
export interface UpdatePurchaseOrderDraftInput {
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

/** Throws catalogValidation / catalogNotFound / catalogVersionConflict. */
export async function updatePurchaseOrderDraftRows(
  tx: Transaction | DatabaseHandle,
  input: UpdatePurchaseOrderDraftInput
): Promise<PurchaseOrderWithItems> {
  assertPurchaseOrderDraftItems(input.items);
  const updatedHeaders = await tx
    .update(catalogPurchaseOrders)
    .set({
      supplierName: input.supplierName ?? null,
      notes: input.notes ?? null,
      version: input.expectedVersion + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(catalogPurchaseOrders.workspaceId, input.workspaceId),
        eq(catalogPurchaseOrders.id, input.purchaseOrderId),
        eq(catalogPurchaseOrders.status, 'draft'),
        eq(catalogPurchaseOrders.version, input.expectedVersion)
      )
    )
    .returning();
  const header = updatedHeaders[0];
  if (!header) {
    const currentRows = await tx
      .select()
      .from(catalogPurchaseOrders)
      .where(
        and(
          eq(catalogPurchaseOrders.workspaceId, input.workspaceId),
          eq(catalogPurchaseOrders.id, input.purchaseOrderId)
        )
      )
      .limit(1);
    const current = currentRows[0];
    if (!current) throw catalogNotFound('PurchaseOrder');
    if (current.status !== 'draft') {
      throw catalogValidation(
        `Only draft purchase orders can be updated, got ${current.status}`
      );
    }
    throw catalogVersionConflict(current.version);
  }
  await tx
    .delete(catalogPurchaseOrderItems)
    .where(
      and(
        eq(catalogPurchaseOrderItems.workspaceId, input.workspaceId),
        eq(catalogPurchaseOrderItems.purchaseOrderId, header.id)
      )
    );
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
