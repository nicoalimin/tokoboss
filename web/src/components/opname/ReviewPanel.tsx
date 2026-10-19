'use client';

import { useState } from 'react';
import type {
  StockCountDetailLineView,
  StockCountDetailView,
  StockCountLineReviewBody,
} from '@tokoboss/contracts';
import { formatIdr } from '@/lib/catalog-client';
import { getStockCountReviewCopy } from '@/lib/stock-count-review-copy';
import { ReviewLineRow } from './ReviewLineRow';

export interface ReviewPanelProps {
  detail: StockCountDetailView;
  /** Optional variantId → SKU label; falls back to the variant id. */
  labels?: Record<string, string>;
  /** Notify parent when per-line review state changes (for Post body). */
  onReviewsChange?: (reviews: StockCountLineReviewBody[]) => void;
}

/**
 * Stock Opname review panel (US12 / RFC 03 task 48c, mockup 4): counted
 * lines with variance / reasons / D4 flags (48b), excluded-lines note for
 * uncounted SKUs, and total Rp variance for Manager/Admin only. Staff see
 * quantities only (no Rp). Phone-first, one column at 360 px, 44 px targets.
 */
export function ReviewPanel(props: ReviewPanelProps) {
  const { detail, labels, onReviewsChange } = props;
  const copy = getStockCountReviewCopy('id');
  const showValue = detail.totalValueCents !== undefined;
  const counted = detail.lines.filter((r) => r.line.countedQty !== null);

  const [reviews, setReviews] = useState<
    Record<string, StockCountLineReviewBody>
  >(() => {
    const init: Record<string, StockCountLineReviewBody> = {};
    for (const r of counted) {
      init[r.line.id] = {
        lineId: r.line.id,
        varianceReasonCode: r.line.varianceReasonCode ?? null,
        varianceNote: r.line.varianceNote ?? null,
        flagVerified: r.line.flagVerified,
      };
    }
    return init;
  });

  function setReview(next: StockCountLineReviewBody) {
    const updated = { ...reviews, [next.lineId]: next };
    setReviews(updated);
    onReviewsChange?.(Object.values(updated));
  }

  const labelOf = (r: StockCountDetailLineView) =>
    labels?.[r.line.variantId] ?? r.line.variantId;

  return (
    <div data-testid="opname-review-panel" className="space-y-4">
      <h2 className="text-lg font-semibold text-neutral-900">
        {copy.reviewTitle}
      </h2>
      {detail.uncountedLines > 0 && (
        <p
          data-testid="opname-review-excluded"
          className="rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-700"
        >
          {copy.excludedNote(detail.uncountedLines)}
        </p>
      )}
      {showValue && (
        <p
          data-testid="opname-review-total"
          className="text-sm font-medium text-neutral-900"
        >
          {copy.totalValue}: {formatIdr(detail.totalValueCents)}
        </p>
      )}
      <ul
        data-testid="opname-review-lines"
        className="divide-y divide-neutral-200"
      >
        {counted.map((r) => (
          <ReviewLineRow
            key={r.line.id}
            row={r}
            label={labelOf(r)}
            showValue={showValue}
            review={reviews[r.line.id] ?? { lineId: r.line.id }}
            onChange={setReview}
          />
        ))}
      </ul>
    </div>
  );
}
