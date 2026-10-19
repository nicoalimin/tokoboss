'use client';

import type {
  StockCountDetailLineView,
  StockCountDetailView,
} from '@tokoboss/contracts';
import { formatIdr } from '@/lib/catalog-client';
import { getStockCountCopy } from '@/lib/stock-count-copy';
import { getStockCountPostedCopy } from '@/lib/stock-count-posted-copy';
import { getStockCountReviewCopy } from '@/lib/stock-count-review-copy';

export interface PostedResultProps {
  detail: StockCountDetailView;
  /** Optional variantId → SKU label; falls back to the variant id. */
  labels?: Record<string, string>;
  /** Optional actor id → display name; falls back to the actor id. */
  actors?: Record<string, string>;
}

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Jakarta',
      })
    : '—';

/**
 * Stock Opname posted result (US12 / RFC 03 task 50, mockup 6): status,
 * "Disetujui sendiri" badge when selfApproved, submit / post actors, and
 * the posted variance lines with reason and ledger entry. Rp value only
 * for Manager/Admin (detail carries totalValueCents). Phone-first; the
 * page owns the back link.
 */
export function PostedResult(props: PostedResultProps) {
  const { detail, labels, actors } = props;
  const base = getStockCountCopy('id');
  const copy = getStockCountPostedCopy('id');
  const reasons = getStockCountReviewCopy('id').reasons;
  const s = detail.session;
  const showValue = detail.totalValueCents !== undefined;
  const counted = detail.lines.filter((r) => r.line.countedQty !== null);
  const moved = counted.filter((r) => (r.variance ?? 0) !== 0);
  const who = (id: string | null) => (id ? (actors?.[id] ?? id) : '—');
  const label = (r: StockCountDetailLineView) =>
    labels?.[r.line.variantId] ?? r.line.variantId;

  return (
    <div data-testid="opname-posted-result" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-neutral-900">
          {copy.postedTitle}
        </h2>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
          {base.status[s.status]}
        </span>
        {s.selfApproved && (
          <span
            data-testid="opname-self-approved"
            className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
          >
            {base.selfApprovedBadge}
          </span>
        )}
      </div>
      <p className="text-sm text-neutral-700">
        {s.code} ·{' '}
        {copy.postedSummary(
          moved.length,
          counted.length - moved.length,
          detail.uncountedLines
        )}
      </p>
      <p className="text-sm text-neutral-600">
        {copy.submittedBy} {who(s.submittedBy)} · {when(s.submittedAt)}
      </p>
      <p className="text-sm text-neutral-600">
        {copy.postedBy} {who(s.postedBy)} · {when(s.postedAt)}
      </p>
      <ul
        data-testid="opname-posted-lines"
        className="divide-y divide-neutral-200"
      >
        {moved.map((r) => (
          <li key={r.line.id} className="space-y-1 py-3 text-sm">
            <div className="flex justify-between gap-2 font-medium">
              <span>{label(r)}</span>
              <span>
                {(r.variance ?? 0) > 0 ? `+${r.variance}` : r.variance}
                {showValue && ` · ${formatIdr(r.varianceValueCents)}`}
              </span>
            </div>
            <p className="text-neutral-600">
              {r.line.varianceReasonCode
                ? reasons[r.line.varianceReasonCode]
                : '—'}{' '}
              · {r.line.ledgerEntryId ?? '—'} ·{' '}
              {(r.variance ?? 0) > 0 ? copy.ledgerIn : copy.ledgerOut}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
