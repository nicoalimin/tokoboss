'use client';

import { useState } from 'react';
import type {
  StockCountDetailView,
  StockCountLineView,
} from '@tokoboss/contracts';
import { getStockCountCountCopy } from '@/lib/stock-count-count-copy';
import { CountScanEntry } from './CountScanEntry';

export interface CountPanelProps {
  workspaceId: string;
  sessionId: string;
  detail: StockCountDetailView;
  /** Optional variantId → SKU label; falls back to the variant id. */
  labels?: Record<string, string>;
}

/**
 * Stock Opname count panel (US12 / RFC 03 task 46b, mockups 2–3): blind-mode
 * note, progress, the scan / type-a-SKU entry (46a) and a searchable line
 * list. Blind mode: the system quantity is never shown here. Uncounted lines
 * are never shown as zero; an explicit zero is labelled as such. Phone-first,
 * one column at 360 px, 44 px touch targets.
 */
export function CountPanel(props: CountPanelProps) {
  const { workspaceId, sessionId, detail, labels } = props;
  const copy = getStockCountCountCopy('id');
  const [lines, setLines] = useState<StockCountLineView[]>(() =>
    detail.lines.map((l) => l.line)
  );
  const [query, setQuery] = useState('');

  const labelOf = (l: StockCountLineView) =>
    labels?.[l.variantId] ?? l.variantId;
  const counted = lines.filter((l) => l.countedQty !== null).length;
  // Labels are SKU codes, so a repeat SKU scan opens the duplicate dialog.
  const countedCodes = labels
    ? lines.filter((l) => l.countedQty !== null).map(labelOf)
    : undefined;
  const q = query.trim().toLowerCase();
  const shown =
    q === ''
      ? lines
      : lines.filter((l) => labelOf(l).toLowerCase().includes(q));

  function onRecorded(line: StockCountLineView) {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.id === line.id);
      if (i < 0) return [...prev, line];
      const next = prev.slice();
      next[i] = line;
      return next;
    });
  }

  function status(l: StockCountLineView): string {
    if (l.countedQty === null) return copy.uncounted;
    if (l.countedQty === 0) return copy.explicitZero;
    return `${l.countedQty} · ${copy.countedScans(l.entryCount)}`;
  }

  return (
    <div data-testid="opname-count-panel" className="space-y-4">
      <p className="rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-700">
        {copy.blindNote}
      </p>
      <p
        data-testid="opname-count-progress"
        className="text-sm font-medium text-neutral-900"
      >
        {copy.progress(counted, lines.length)}
      </p>
      <CountScanEntry
        workspaceId={workspaceId}
        sessionId={sessionId}
        countedCodes={countedCodes}
        onRecorded={onRecorded}
      />
      <label className="block text-sm text-neutral-700">
        {copy.searchLabel}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-neutral-300 px-3"
        />
      </label>
      <ul
        data-testid="opname-count-lines"
        className="divide-y divide-neutral-200 text-sm"
      >
        {shown.map((l) => (
          <li
            key={l.id}
            className="flex min-h-11 items-center justify-between gap-3 py-2"
          >
            <span className="break-all font-mono text-neutral-900">
              {labelOf(l)}
            </span>
            <span
              className={
                l.countedQty === null ? 'text-neutral-500' : 'text-neutral-900'
              }
            >
              {status(l)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
