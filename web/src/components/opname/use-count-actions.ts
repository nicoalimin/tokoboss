'use client';

import { useState } from 'react';
import type {
  StockCountLineReviewBody,
  StockCountSessionView,
} from '@tokoboss/contracts';
import {
  postStockCount,
  runStockCountAction,
} from '@/lib/stock-count-client-actions';

export type CountActionMode = 'submit' | 'return' | 'post';

export interface UseCountActionsInput {
  workspaceId: string;
  session: StockCountSessionView;
  /** Per-line review state from ReviewPanel (48c) for the Post body. */
  reviews?: StockCountLineReviewBody[];
  /** Called with the updated session after submit / return / post. */
  onDone?: (session: StockCountSessionView) => void;
}

/**
 * State + calls for the Stock Opname actions bar (US12 / RFC 03 task 49b):
 * which confirm is open, the optional note, busy / error, and `run` for
 * submit / return (actions route) or post (post route). CAS on
 * session.version; one Post idempotency key per mount so a retry replays.
 */
export function useCountActions(input: UseCountActionsInput) {
  const { workspaceId, session: s, reviews, onDone } = input;
  const [mode, setMode] = useState<CountActionMode | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idemKey] = useState(() => `post-${crypto.randomUUID()}`);

  async function run(m: CountActionMode) {
    setBusy(true);
    setError(null);
    const expectedVersion = s.version;
    try {
      const res =
        m === 'post'
          ? await postStockCount(workspaceId, s.id, {
              expectedVersion,
              idempotencyKey: idemKey,
              lines: reviews,
            })
          : await runStockCountAction(workspaceId, s.id, {
              action: m,
              expectedVersion,
              note: note.trim() || null,
            });
      setMode(null);
      setNote('');
      onDone?.(res.session);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return { mode, setMode, note, setNote, busy, error, run };
}
