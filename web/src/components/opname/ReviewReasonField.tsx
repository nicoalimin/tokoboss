'use client';

import type {
  StockCountLineReviewBody,
  StockCountVarianceReasonCodeWire,
} from '@tokoboss/contracts';
import { getStockCountReviewCopy } from '@/lib/stock-count-review-copy';

export interface ReviewReasonFieldProps {
  review: StockCountLineReviewBody;
  onChange: (next: StockCountLineReviewBody) => void;
}

const REASONS: StockCountVarianceReasonCodeWire[] = [
  'damaged_expired',
  'lost',
  'prior_input_error',
  'unrecorded_receipt',
  'other',
];

/**
 * Variance reason picker for one review line (US12 / RFC 03 task 48a,
 * mockup 4, D3): Rusak/kedaluwarsa, Hilang, Salah input sebelumnya,
 * Penerimaan belum dicatat or Lainnya. Lainnya needs a note (max 500 chars).
 * Controlled: the parent keeps the line review state that Post sends.
 */
export function ReviewReasonField(props: ReviewReasonFieldProps) {
  const { review, onChange } = props;
  const copy = getStockCountReviewCopy('id');
  const reason = review.varianceReasonCode ?? null;
  const note = review.varianceNote ?? '';

  return (
    <div data-testid="opname-review-reason" className="space-y-2">
      <label className="block text-neutral-700">
        {copy.reasonLabel}
        <select
          value={reason ?? ''}
          onChange={(e) =>
            onChange({
              ...review,
              varianceReasonCode:
                e.target.value === ''
                  ? null
                  : (e.target.value as StockCountVarianceReasonCodeWire),
            })
          }
          className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 px-3"
        >
          <option value="">{copy.reasonPlaceholder}</option>
          {REASONS.map((r) => (
            <option key={r} value={r}>
              {copy.reasons[r]}
            </option>
          ))}
        </select>
      </label>
      {reason === 'other' && (
        <label className="block text-neutral-700">
          {copy.noteLabel}
          <input
            type="text"
            value={note}
            maxLength={500}
            onChange={(e) =>
              onChange({ ...review, varianceNote: e.target.value })
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 px-3"
          />
          {note.trim() === '' && (
            <span className="mt-1 block text-red-700">{copy.noteRequired}</span>
          )}
        </label>
      )}
    </div>
  );
}
