'use client';

import { useEffect, useState } from 'react';
import { getStockCountCountCopy } from '@/lib/stock-count-count-copy';

export type DuplicateScanChoice = 'add' | 'replace';

export interface DuplicateScanDialogProps {
  open: boolean;
  /** SKU label or scanned code of the line that is already counted. */
  skuLabel: string;
  onChoose: (mode: DuplicateScanChoice, remember: boolean) => void;
  onClose: () => void;
}

/**
 * Duplicate-scan dialog for the Stock Opname count panel (US12 / RFC 03 task
 * 47). Shown when a SKU that is already counted is scanned again: the counter
 * picks Add (sum with the earlier count) or Replace, and may tick "remember
 * for this session". Presentational only; the caller records the entry.
 * Blind mode: no system quantity here. Phone-first, 44 px touch targets,
 * Escape or a backdrop tap closes without recording.
 */
export function DuplicateScanDialog(props: DuplicateScanDialogProps) {
  const { open, skuLabel, onChoose, onClose } = props;
  const copy = getStockCountCountCopy('id');
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRemember(false);
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const btn = 'min-h-11 flex-1 rounded-lg px-4 text-sm font-medium';
  return (
    <div
      data-testid="opname-dup-overlay"
      className="fixed inset-0 z-modal flex items-end justify-center bg-neutral-900/40 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="opname-dup-title"
        data-testid="opname-dup-dialog"
        className="w-full max-w-sm space-y-4 rounded-xl bg-white p-5 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="opname-dup-title"
          className="text-base font-semibold text-neutral-900"
        >
          {copy.dupTitle}
        </h2>
        <p className="break-all font-mono text-sm text-neutral-900">
          {skuLabel}
        </p>
        <p className="text-sm text-neutral-700">{copy.dupBody}</p>
        <label className="flex min-h-11 items-center gap-3 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-5 w-5"
          />
          {copy.dupRemember}
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => onChoose('add', remember)}
            className={`${btn} bg-neutral-900 text-white`}
          >
            {copy.dupAdd}
          </button>
          <button
            type="button"
            onClick={() => onChoose('replace', remember)}
            className={`${btn} border border-neutral-300 text-neutral-900`}
          >
            {copy.dupReplace}
          </button>
        </div>
      </div>
    </div>
  );
}
