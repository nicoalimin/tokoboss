'use client';

import { useCallback, useState, type FormEvent } from 'react';
import type { StockCountLineView } from '@tokoboss/contracts';
import { recordCountEntry } from '@/lib/stock-count-client-actions';
import { getStockCountCountCopy } from '@/lib/stock-count-count-copy';
import {
  DuplicateScanDialog,
  type DuplicateScanChoice,
} from './DuplicateScanDialog';

const FIELD = 'mt-1 min-h-11 w-full rounded-lg border border-neutral-300 px-3';
const MAX_QTY = 1_000_000;

export interface CountScanEntryProps {
  workspaceId: string;
  sessionId: string;
  /** Scan codes already counted before this panel opened (dup check). */
  countedCodes?: readonly string[];
  onRecorded: (line: StockCountLineView, deduplicated: boolean) => void;
}

/**
 * Scan / type-a-SKU entry for the Stock Opname count panel (US12 / RFC 03
 * task 46a, mockup 2). A keyboard-wedge scanner types into the code field and
 * sends Enter, which submits with the current quantity (default 1). Each save
 * is one `add` entry with a fresh clientEntryId (server dedupes replays).
 * Online only; errors show client-safe copy. 44 px touch targets.
 */
export function CountScanEntry(props: CountScanEntryProps) {
  const { workspaceId, sessionId, countedCodes, onRecorded } = props;
  const copy = getStockCountCountCopy('id');
  const [code, setCode] = useState('');
  const [qty, setQty] = useState('1');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  const [pending, setPending] = useState<{ code: string; n: number } | null>(
    null
  );
  const [remembered, setRemembered] = useState<DuplicateScanChoice | null>(
    null
  );
  const closeDup = useCallback(() => setPending(null), []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const scanCode = code.trim();
    if (scanCode === '' || saving) return;
    const n = Number(qty.trim());
    const bad = !/^\d+$/.test(qty.trim()) || n > MAX_QTY;
    if (bad || !navigator.onLine) {
      setError(bad ? copy.qtyInvalid : copy.onlineRequired);
      return;
    }
    const dup = seen.has(scanCode) || !!countedCodes?.includes(scanCode);
    if (dup && remembered === null) setPending({ code: scanCode, n });
    else await save(scanCode, n, dup && remembered ? remembered : 'add');
  }

  async function save(scanCode: string, n: number, mode: DuplicateScanChoice) {
    setSaving(true);
    setError(null);
    try {
      const r = await recordCountEntry(workspaceId, sessionId, {
        scanCode,
        qty: n,
        mode,
        clientEntryId: crypto.randomUUID(),
      });
      setSeen((prev) => new Set(prev).add(scanCode));
      onRecorded(r.line, r.deduplicated);
      setCode('');
      setQty('1');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : copy.notInSession);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      data-testid="opname-scan-entry"
      onSubmit={submit}
      className="space-y-3 text-sm"
    >
      <label className="block text-neutral-700">
        {copy.scanLabel}
        <input
          type="text"
          autoFocus
          autoComplete="off"
          value={code}
          placeholder={copy.scanPlaceholder}
          onChange={(e) => setCode(e.target.value)}
          className={`${FIELD} font-mono`}
        />
      </label>
      <div className="flex items-end gap-2">
        <label className="block flex-1 text-neutral-700">
          {copy.qtyLabel}
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className={FIELD}
          />
        </label>
        <button
          type="submit"
          disabled={saving || code.trim() === ''}
          className="min-h-11 rounded-lg bg-neutral-900 px-4 text-white disabled:opacity-50"
        >
          {saving ? copy.saving : copy.saveEntry}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <p className="text-neutral-500">{copy.savedNote}</p>
      <DuplicateScanDialog
        open={pending !== null}
        skuLabel={pending?.code ?? ''}
        onChoose={(mode, remember) => {
          if (remember) setRemembered(mode);
          setPending(null);
          if (pending) void save(pending.code, pending.n, mode);
        }}
        onClose={closeDup}
      />
    </form>
  );
}
