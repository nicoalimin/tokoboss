'use client';

import { getStockCountCopy } from '@/lib/stock-count-copy';

export interface CountActionConfirmProps {
  title: string;
  body?: string;
  /** Note field label; omit to hide the note (Post has no note). */
  noteLabel?: string;
  notePlaceholder?: string;
  note: string;
  onNoteChange: (note: string) => void;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Inline confirm for Stock Opname actions (US12 / RFC 03 task 49a, mockup
 * 5): title, optional body, optional note, Confirm / Batal. Used by the
 * actions bar (49c) for submit, return and post. Phone-first, 44 px touch
 * targets; both buttons are disabled while the action is in flight.
 */
export function CountActionConfirm(props: CountActionConfirmProps) {
  const { title, body, noteLabel, note, busy } = props;
  const btn = 'min-h-11 rounded-lg px-4 text-sm disabled:opacity-50';
  return (
    <div
      role="dialog"
      aria-label={title}
      data-testid="opname-action-confirm"
      className="space-y-3 rounded-lg border border-neutral-200 p-3"
    >
      <p className="font-medium text-neutral-900">{title}</p>
      {body && <p className="text-sm text-neutral-600">{body}</p>}
      {noteLabel && (
        <label className="block text-sm text-neutral-700">
          {noteLabel}
          <textarea
            value={note}
            placeholder={props.notePlaceholder}
            onChange={(e) => props.onNoteChange(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </label>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={props.onConfirm}
          className={`${btn} bg-neutral-900 text-white`}
        >
          {props.confirmLabel}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={props.onCancel}
          className={`${btn} border border-neutral-300 text-neutral-900`}
        >
          {getStockCountCopy('id').cancelButton}
        </button>
      </div>
    </div>
  );
}
