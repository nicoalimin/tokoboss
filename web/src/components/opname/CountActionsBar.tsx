'use client';

import type {
  StockCountDetailView,
  StockCountLineReviewBody,
  StockCountSessionView,
} from '@tokoboss/contracts';
import { getStockCountActionsCopy } from '@/lib/stock-count-actions-copy';
import { CountActionConfirm } from './CountActionConfirm';
import { useCountActions } from './use-count-actions';

const BTN = 'min-h-11 rounded-lg px-4 text-sm';

export interface CountActionsBarProps {
  workspaceId: string;
  detail: StockCountDetailView;
  /** Per-line review state from ReviewPanel (48c) for the Post body. */
  reviews?: StockCountLineReviewBody[];
  /** Called with the updated session after submit / return / post. */
  onDone?: (session: StockCountSessionView) => void;
}

/**
 * Stock Opname actions bar (US12 / RFC 03 task 49c, mockup 5): Submit while
 * counting; Post and Return once submitted, Manager/Admin only (Staff get
 * the no-permission note, never Post). Confirms via CountActionConfirm
 * (49a); state and calls in useCountActions (49b). 44 px touch targets.
 */
export function CountActionsBar(props: CountActionsBarProps) {
  const { workspaceId, detail, reviews, onDone } = props;
  const copy = getStockCountActionsCopy('id');
  const s = detail.session;
  const a = useCountActions({ workspaceId, session: s, reviews, onDone });
  const canPost = detail.totalValueCents !== undefined;
  const n = detail.lines.filter((r) => (r.variance ?? 0) !== 0).length;

  if (s.status !== 'counting' && s.status !== 'submitted') return null;
  const dialog = {
    submit: {
      title: copy.submitTitle,
      body: copy.submitSubtitle(detail.countedLines, detail.uncountedLines),
      noteLabel: copy.submitNoteLabel,
      confirmLabel: copy.submitConfirm,
    },
    return: {
      title: copy.returnTitle,
      noteLabel: copy.returnNoteLabel,
      confirmLabel: copy.returnConfirm,
    },
    post: {
      title: copy.postTitle(n),
      body: `${copy.postBody} ${copy.postIrreversible}`,
      confirmLabel: copy.postConfirm,
    },
  };

  return (
    <div data-testid="opname-actions-bar" className="space-y-3">
      {a.mode === null && s.status === 'counting' && (
        <button
          type="button"
          className={`${BTN} bg-neutral-900 text-white`}
          onClick={() => a.setMode('submit')}
        >
          {copy.submit}
        </button>
      )}
      {a.mode === null && s.status === 'submitted' && canPost && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="opname-post"
            className={`${BTN} bg-neutral-900 text-white`}
            onClick={() => a.setMode('post')}
          >
            {copy.post(n)}
          </button>
          <button
            type="button"
            className={`${BTN} border border-neutral-300`}
            onClick={() => a.setMode('return')}
          >
            {copy.returnAction}
          </button>
        </div>
      )}
      {s.status === 'submitted' && !canPost && (
        <p className="text-sm text-neutral-600">{copy.noPostPermission}</p>
      )}
      {a.mode !== null && (
        <CountActionConfirm
          {...dialog[a.mode]}
          notePlaceholder={copy.submitNotePlaceholder}
          note={a.note}
          onNoteChange={a.setNote}
          busy={a.busy}
          onConfirm={() => a.mode && void a.run(a.mode)}
          onCancel={() => a.setMode(null)}
        />
      )}
      {a.error && (
        <p role="alert" className="text-sm text-red-700">
          {a.error}
        </p>
      )}
    </div>
  );
}
