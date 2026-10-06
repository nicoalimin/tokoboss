import { catalogValidation } from '@tokoboss/application';

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
