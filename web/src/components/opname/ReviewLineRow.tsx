'use client';

import type {
  StockCountDetailLineView,
  StockCountLineReviewBody,
} from '@tokoboss/contracts';
import { formatIdr } from '@/lib/catalog-client';
import { getStockCountReviewCopy } from '@/lib/stock-count-review-copy';
import { ReviewReasonField } from './ReviewReasonField';

export interface ReviewLineRowProps {
  row: StockCountDetailLineView;
  label: string;
  /** Manager/Admin only; Staff see quantities only (no Rp). */
  showValue: boolean;
  review: StockCountLineReviewBody;
  onChange: (next: StockCountLineReviewBody) => void;
}

/**
 * One counted line on the Stock Opname review screen (US12 / RFC 03 task 48b,
 * mockup 4): system vs counted, variance, Rp value for Manager/Admin only,
 * D4 flag badges with the re-verify tick, and the variance reason field
 * (48a) when variance is not zero. Matched lines show "Cocok" and need no
 * reason.
 */
export function ReviewLineRow(props: ReviewLineRowProps) {
  const { row, label, showValue, review, onChange } = props;
  const copy = getStockCountReviewCopy('id');
  const variance = row.variance ?? 0;
  const tone =
    variance === 0
      ? 'text-emerald-700'
      : variance < 0
        ? 'font-medium text-red-700'
        : 'font-medium text-neutral-900';

  return (
    <li data-testid="opname-review-line" className="space-y-2 py-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <span className="break-all font-mono text-neutral-900">{label}</span>
        <span className={tone}>
          {variance === 0
            ? copy.matched
            : variance > 0
              ? `+${variance}`
              : variance}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-neutral-700 sm:grid-cols-4">
        <dt>{copy.colSystem}</dt>
        <dd>{row.line.systemQtyAtCount ?? '—'}</dd>
        <dt>{copy.colCounted}</dt>
        <dd>{row.line.countedQty ?? '—'}</dd>
        {showValue && (
          <>
            <dt>{copy.colValue}</dt>
            <dd data-testid="opname-review-value">
              {row.varianceValueCents == null
                ? copy.noHpp
                : formatIdr(row.varianceValueCents)}
            </dd>
          </>
        )}
      </dl>
      {row.flags.length > 0 && (
        <div className="space-y-1 rounded-lg bg-amber-50 px-3 py-2">
          {row.flags.map((f) => (
            <p key={f} className="text-amber-800">
              {copy.flags[f]}
            </p>
          ))}
          <label className="flex min-h-11 items-center gap-2 text-neutral-900">
            <input
              type="checkbox"
              checked={review.flagVerified ?? false}
              onChange={(e) =>
                onChange({ ...review, flagVerified: e.target.checked })
              }
              className="h-5 w-5"
            />
            {copy.verifyTick}
          </label>
        </div>
      )}
      {variance !== 0 && (
        <ReviewReasonField review={review} onChange={onChange} />
      )}
    </li>
  );
}
