import { isPurchaseOrderStatus } from '@tokoboss/application';
import type {
  PurchaseOrderItemRecord,
  PurchaseOrderRecord,
} from '@tokoboss/application';
import type {
  CatalogPurchaseOrderItemRow,
  CatalogPurchaseOrderRow,
} from '../schema/index';

/**
 * Row → record mappers for draft purchase orders (UTA-146 Slice 1d / Story 11).
 * Used by `DrizzleCatalogStore.createPurchaseOrderDraft`.
 */
export function toPurchaseOrder(
  row: CatalogPurchaseOrderRow
): PurchaseOrderRecord {
  if (!isPurchaseOrderStatus(row.status)) {
    throw new Error(
      `CATALOG_CORRUPT: unknown purchase order status ${row.status}`
    );
  }
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    referenceNum: row.referenceNum,
    status: row.status,
    supplierName: row.supplierName ?? null,
    notes: row.notes ?? null,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPurchaseOrderItem(
  row: CatalogPurchaseOrderItemRow
): PurchaseOrderItemRecord {
  return {
    id: row.id,
    purchaseOrderId: row.purchaseOrderId,
    workspaceId: row.workspaceId,
    variantId: row.variantId,
    quantity: row.quantity,
    unitCostCents: row.unitCostCents ?? null,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
