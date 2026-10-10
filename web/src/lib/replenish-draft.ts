/**
 * Draft purchase-order preview helpers (UTA-147 slice 3a, Story 11 web).
 *
 * Pure functions (no fetch, no React) that turn selected low-stock
 * recommendations into a draft-PO preview and a create body.
 *
 * Honesty rules from the Story 11 mockup:
 * - SKUs without a supplier are blocked from the draft (listed separately).
 * - Missing HPP is flagged per line; unit cost is never invented, so the
 *   create body leaves `unitCostCents` out (stored as null).
 * - A suggested qty of 0 with no override is skipped (nothing to order).
 */

import type {
  CreatePurchaseOrderDraftBody,
  LowStockRecommendationView,
} from '@tokoboss/contracts';

export interface DraftPoLine {
  variantId: string;
  skuCode: string;
  label: string;
  quantity: number;
  missingHpp: boolean;
}

export interface DraftPoPreview {
  lines: DraftPoLine[];
  blockedNoSupplier: string[];
  missingHppCount: number;
  canCreate: boolean;
}

function lineLabel(rec: LowStockRecommendationView): string {
  return rec.variantName
    ? `${rec.productName} ${rec.variantName}`
    : rec.productName;
}

/** Build the draft-PO preview; `qtyOverrides` is keyed by variantId. */
export function buildDraftPoPreview(
  selected: LowStockRecommendationView[],
  qtyOverrides: Record<string, number> = {}
): DraftPoPreview {
  const lines: DraftPoLine[] = [];
  const blockedNoSupplier: string[] = [];
  for (const rec of selected) {
    if (rec.missingSupplier) {
      blockedNoSupplier.push(rec.skuCode);
      continue;
    }
    const quantity = qtyOverrides[rec.variantId] ?? rec.suggestedReorderQty;
    if (!Number.isInteger(quantity) || quantity <= 0) continue;
    lines.push({
      variantId: rec.variantId,
      skuCode: rec.skuCode,
      label: lineLabel(rec),
      quantity,
      missingHpp: rec.missingHpp,
    });
  }
  return {
    lines,
    blockedNoSupplier,
    missingHppCount: lines.filter((l) => l.missingHpp).length,
    canCreate: lines.length > 0,
  };
}

/** Draft reference like `PO-20261010-1851` (UTC, minute precision). */
export function draftReferenceNum(now: Date): string {
  const iso = now.toISOString();
  return `PO-${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 16).replace(':', '')}`;
}

/** Create body for POST purchase-orders; never invents unit costs. */
export function toCreateDraftBody(
  preview: DraftPoPreview,
  referenceNum: string,
  opts: { supplierName?: string | null; notes?: string | null } = {}
): CreatePurchaseOrderDraftBody {
  return {
    referenceNum,
    supplierName: opts.supplierName ?? null,
    notes: opts.notes ?? null,
    items: preview.lines.map((l) => ({
      variantId: l.variantId,
      quantity: l.quantity,
    })),
  };
}
