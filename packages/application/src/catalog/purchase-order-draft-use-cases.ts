/**
 * Draft purchase order use-case (UTA-146 Slice 1d / Story 11 — draft only).
 *
 * Converts selected low-stock recommendations into a DRAFT purchase order.
 * Manager/Admin only. Missing supplier / unit cost stay null (flagged,
 * never invented). Per-line validation (quantity, cost, variant tenancy)
 * and duplicate referenceNum are enforced again by the store; this layer
 * adds tenancy, RBAC, and input trimming. PO send / receive is Story 10.
 */

import type { WorkspaceContext } from '../tenancy/tenancy-types';
import {
  assertManagerOrAdmin,
  assertSameWorkspace,
} from '../tenancy/workspace-context';
import { catalogValidation } from './catalog-errors';
import type { CatalogStore } from './catalog-ports';
import type { PurchaseOrderWithItems } from './catalog-types';

export async function createPurchaseOrderDraft(
  store: CatalogStore,
  input: {
    ctx: WorkspaceContext;
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
): Promise<PurchaseOrderWithItems> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  assertManagerOrAdmin(input.ctx);

  const referenceNum = input.referenceNum.trim();
  if (referenceNum.length === 0) {
    throw catalogValidation('referenceNum is required');
  }

  if (input.items.length === 0) {
    throw catalogValidation('A draft purchase order needs at least one item.');
  }

  const trimmedSupplier = input.supplierName?.trim() ?? '';
  const supplierName = trimmedSupplier.length > 0 ? trimmedSupplier : null;
  const trimmedNotes = input.notes?.trim() ?? '';
  const notes = trimmedNotes.length > 0 ? trimmedNotes : null;

  return store.createPurchaseOrderDraft({
    workspaceId: input.workspaceId,
    referenceNum,
    supplierName,
    notes,
    items: input.items.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
      unitCostCents: item.unitCostCents ?? null,
    })),
  });
}
