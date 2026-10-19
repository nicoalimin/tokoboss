'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { StockCountDetailView } from '@tokoboss/contracts';
import { getStockCount } from '@/lib/stock-count-client';
import { getStockCountCopy } from '@/lib/stock-count-copy';

const PILL = 'rounded-full px-2 py-0.5 text-xs';

/**
 * Stock Opname session page shell (US12 / RFC 03 task 45): loads the session
 * detail and switches on its status. Each state renders an empty slot that a
 * later task fills: counting → CountPanel (46), submitted → ReviewPanel (48),
 * posted → PostedResult (50); cancelled shows the reason. The
 * `/w/[workspaceId]` layout enforces membership; Rp values arrive only for
 * Manager/Admin. Phone-first: one column at 360 px, 44 px touch targets.
 */
export default function OpnameSessionPage() {
  const params = useParams<{ workspaceId: string; sessionId: string }>();
  const ws = params?.workspaceId ?? '';
  const id = params?.sessionId ?? '';
  const copy = getStockCountCopy('id');
  const [detail, setDetail] = useState<StockCountDetailView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ws || !id) return;
    let off = false;
    getStockCount(ws, id)
      .then((d) => !off && setDetail(d))
      .catch(
        (e: unknown) =>
          !off && setError(e instanceof Error ? e.message : copy.loading)
      );
    return () => {
      off = true;
    };
  }, [ws, id, copy.loading]);

  const s = detail?.session;
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-6 sm:px-8">
      <Link
        href={`/w/${encodeURIComponent(ws)}/opname`}
        className="inline-flex min-h-11 items-center text-sm text-neutral-600 hover:underline"
      >
        {copy.backToList}
      </Link>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}
      {!error && !s && (
        <p className="mt-6 text-sm text-neutral-600">{copy.loading}</p>
      )}
      {s && (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-neutral-900">
              {s.name}
            </h1>
            <span className="text-xs text-neutral-500">{s.code}</span>
            <span
              data-testid="opname-session-status"
              className={`${PILL} bg-neutral-100 text-neutral-700`}
            >
              {copy.status[s.status]}
            </span>
            {s.selfApproved && (
              <span
                data-testid="opname-self-approved"
                className={`${PILL} bg-amber-100 text-amber-900`}
              >
                {copy.selfApprovedBadge}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-neutral-600">{copy.snapshotNote}</p>
          {s.status === 'counting' && (
            <section data-testid="opname-panel-counting" className="mt-6" />
          )}
          {s.status === 'submitted' && (
            <section data-testid="opname-panel-review" className="mt-6" />
          )}
          {s.status === 'posted' && (
            <section data-testid="opname-panel-posted" className="mt-6" />
          )}
          {s.status === 'cancelled' && (
            <p
              data-testid="opname-panel-cancelled"
              className="mt-6 text-sm text-neutral-600"
            >
              {s.cancelReason ?? copy.status.cancelled}
            </p>
          )}
        </>
      )}
    </main>
  );
}
