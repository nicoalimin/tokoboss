/**
 * Restock budget cap for low-stock recommendations (UTA-146 slice 1i-i /
 * Story 11 edge case: "Recommendations do not exceed a seller-defined budget
 * when configured").
 * Pure, no I/O. Walks the rows in the given order and trims each
 * suggestedReorderQty so the running subtotal (qty x HPP) never exceeds the
 * budget. Trimmed rows stay in the list (cut, not hidden) and say why.
 * A row without HPP cannot be priced, so its qty is left as is and an
 * explainability line says it was not counted against the budget.
 */

import type { LowStockRecommendation } from './low-stock-recommendation';

export type BudgetCapInput = {
  /** Seller-defined restock budget in cents; null/undefined = no cap. */
  budgetCents: number | null | undefined;
  /** HPP (unit cost) in cents per variantId; missing/null = unknown. */
  hppCentsByVariant: ReadonlyMap<string, number | null>;
};

function formatRupiah(cents: number): string {
  const rupiah = String(Math.floor(cents / 100));
  return `Rp ${rupiah.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

export function applyBudgetCap(
  rows: readonly LowStockRecommendation[],
  input: BudgetCapInput
): LowStockRecommendation[] {
  const budgetCents = input.budgetCents ?? null;
  if (budgetCents === null) {
    return rows.map((row) => ({
      ...row,
      explainability: [...row.explainability],
    }));
  }

  let remainingCents = Math.max(0, budgetCents);
  return rows.map((row) => {
    const explainability = [...row.explainability];
    const hppCents = input.hppCentsByVariant.get(row.variantId) ?? null;
    if (hppCents === null || hppCents <= 0) {
      explainability.push(
        'HPP kosong — saran ini tidak dihitung ke plafon anggaran'
      );
      return { ...row, explainability };
    }

    const affordableQty = Math.floor(remainingCents / hppCents);
    let suggestedReorderQty = row.suggestedReorderQty;
    if (suggestedReorderQty > affordableQty) {
      suggestedReorderQty = affordableQty;
      explainability.push(
        `Saran dipotong plafon anggaran ${formatRupiah(budgetCents)}: ` +
          `${row.suggestedReorderQty} → ${suggestedReorderQty} unit`
      );
    }
    remainingCents -= suggestedReorderQty * hppCents;
    return { ...row, suggestedReorderQty, explainability };
  });
}
