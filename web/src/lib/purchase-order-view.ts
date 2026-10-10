/**
 * Purchase-order view mapper (UTA-146 Slice 1j / Story 11).
 *
 * Shared by the draft purchase-order routes (POST create, PATCH update) so
 * both return the same `PurchaseOrderWithItemsView` JSON shape. Dates become
 * ISO strings; nullable supplier / notes / unit cost stay null.
 */

import type { PurchaseOrderWithItems } from '@tokoboss/application';
import type { PurchaseOrderWithItemsView } from '@tokoboss/contracts';

export function toPurchaseOrderWithItemsView(
  result: PurchaseOrderWithItems
): PurchaseOrderWithItemsView {
  const po = result.purchaseOrder;
  return {
    purchaseOrder: {
      id: po.id,
      workspaceId: po.workspaceId,
      referenceNum: po.referenceNum,
      status: po.status,
      supplierName: po.supplierName,
      notes: po.notes,
      version: po.version,
      createdAt: po.createdAt.toISOString(),
      updatedAt: po.updatedAt.toISOString(),
    },
    items: result.items.map((item) => ({
      id: item.id,
      purchaseOrderId: item.purchaseOrderId,
      workspaceId: item.workspaceId,
      variantId: item.variantId,
      quantity: item.quantity,
      unitCostCents: item.unitCostCents,
      version: item.version,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
  };
}
