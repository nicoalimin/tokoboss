'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { StockCountListItemView } from '@tokoboss/contracts';
import { listStockCounts } from '@/lib/stock-count-client';
import { getStockCountCopy } from '@/lib/stock-count-copy';
import { StartCountForm } from '@/components/opname/StartCountForm';

const BTN = 'inline-flex min-h-11 items-center justify-center rounded-lg px-4';
const PILL = 'rounded-full px-2 py-0.5 text-xs';

/**
 * Stock Opname list page (US12 / RFC 03 task 43): sessions from the list
 * route, "Lanjutkan sesi" on counting sessions, the start entry (task 44
 * mounts StartCountForm when `starting`) and the "Disetujui sendiri" badge
 * when `selfApproved`. The `/w/[workspaceId]` layout enforces membership.
 * Phone-first: one column at 360 px, touch targets of at least 44 px.
 */
export default function WorkspaceOpnamePage() {
  const ws = useParams<{ workspaceId: string }>()?.workspaceId ?? '';
  const copy = getStockCountCopy('id');
  const [rows, setRows] = useState<StockCountListItemView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!ws) return;
    let off = false;
    listStockCounts(ws)
      .then((r) => !off && setRows(r))
      .catch(
        (e: unknown) =>
          !off && setError(e instanceof Error ? e.message : copy.loading)
      );
    return () => {
      off = true;
    };
  }, [ws, copy.loading]);

  const href = (id: string) =>
    `/w/${encodeURIComponent(ws)}/opname/${encodeURIComponent(id)}`;
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-6 sm:px-8">
      <h1 className="text-2xl font-semibold text-neutral-900">
        {copy.pageTitle}
      </h1>
      <p className="mt-1 text-sm text-neutral-600">{copy.pageSubtitle}</p>
      <button
        type="button"
        data-testid="opname-start"
        aria-expanded={starting}
        onClick={() => setStarting((v) => !v)}
        className={`${BTN} mt-4 w-full bg-neutral-900 text-sm text-white sm:w-auto`}
      >
        {starting ? copy.cancelButton : copy.startButton}
      </button>
      {starting && (
        <StartCountForm
          workspaceId={ws}
          onStarted={(id) => router.push(href(id))}
          onCancel={() => setStarting(false)}
        />
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}
      {!error && rows === null && (
        <p className="mt-6 text-sm text-neutral-600">{copy.loading}</p>
      )}
      {rows?.length === 0 && (
        <div
          data-testid="opname-empty"
          className="mt-6 text-center text-sm text-neutral-600"
        >
          <p className="font-medium text-neutral-900">{copy.emptyTitle}</p>
          <p>{copy.emptyBody}</p>
        </div>
      )}
      <ul className="mt-6 space-y-3">
        {rows?.map((s) => (
          <li
            key={s.id}
            data-testid="opname-session"
            className="rounded-xl border border-neutral-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={href(s.id)}
                className="font-medium text-neutral-900 hover:underline"
              >
                {s.name}
              </Link>
              <span className="text-xs text-neutral-500">{s.code}</span>
              <span className={`${PILL} bg-neutral-100 text-neutral-700`}>
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
            {s.status === 'counting' && (
              <Link
                href={href(s.id)}
                className={`${BTN} mt-3 w-full border border-neutral-300 text-sm sm:w-auto`}
              >
                {copy.resumeButton}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
