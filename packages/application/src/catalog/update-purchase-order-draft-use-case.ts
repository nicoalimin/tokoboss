/**
 * Update draft purchase order use-case (UTA-146 Slice 1j / Story 11).
 *
 * Edits a DRAFT purchase order's supplier, notes, and full item list with
 * optimistic CAS on `expectedVersion`. Manager/Admin only. Empty supplier /
 * notes become null (flagged, never invented). Per-line validation, draft
 * status, and version conflicts are enforced again by the store; this layer
 * adds tenancy, RBAC, and input trimming.
 */

import type { WorkspaceContext } from '../tenancy/tenancy-types';
import {
  assertManagerOrAdmin,
  assertSameWorkspace,
} from '../tenancy/workspace-context';
import { catalogValidation } from './catalog-errors';
import type { CatalogStore } from './catalog-ports';
import type { PurchaseOrderWithItems } from './catalog-types';

export async function updatePurchaseOrderDraft(
  store: CatalogStore,
  input: {
    ctx: WorkspaceContext;
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
): Promise<PurchaseOrderWithItems> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  assertManagerOrAdmin(input.ctx);

  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw catalogValidation('expectedVersion must be a positive integer');
  }

  if (input.items.length === 0) {
    throw catalogValidation('A draft purchase order needs at least one item.');
  }

  const trimmedSupplier = input.supplierName?.trim() ?? '';
  const supplierName = trimmedSupplier.length > 0 ? trimmedSupplier : null;
  const trimmedNotes = input.notes?.trim() ?? '';
  const notes = trimmedNotes.length > 0 ? trimmedNotes : null;

  return store.updatePurchaseOrderDraft({
    workspaceId: input.workspaceId,
    purchaseOrderId: input.purchaseOrderId,
    expectedVersion: input.expectedVersion,
    supplierName,
    notes,
    items: input.items.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
      unitCostCents: item.unitCostCents ?? null,
    })),
  });
}
