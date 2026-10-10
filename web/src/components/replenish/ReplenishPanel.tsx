'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LowStockRecommendationView } from '@tokoboss/contracts';
import { AmbangPanel } from '@/components/replenish/AmbangPanel';
import { BudgetFilter } from '@/components/replenish/BudgetFilter';
import { LowStockRow } from '@/components/replenish/LowStockRow';
import { ReplenishDraftSection } from '@/components/replenish/ReplenishDraftSection';
import {
  ReplenishClientError,
  listLowStockRecommendations,
  setRecommendationState,
} from '@/lib/replenish-client';
import { getMyMembership, TeamClientError } from '@/lib/team-client';

const genericError = 'Daftar stok tipis tidak dapat dimuat. Silakan coba lagi.';
const SNOOZE_DAYS = 7;

/**
 * Stok tipis panel (UTA-147 slice 3e, Story 11 web): load the low-stock
 * list, select rows, and dismiss/snooze (snooze = 7 days). Selected rows
 * feed the draft-PO section (slice 3g); a DRAFT PO is never sent.
 */
export function ReplenishPanel() {
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [recs, setRecs] = useState<LowStockRecommendationView[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ambangId, setAmbangId] = useState<string | null>(null);
  const [budgetCents, setBudgetCents] = useState<number | null>(null);

  const fail = useCallback(
    (err: unknown) => {
      const known =
        err instanceof ReplenishClientError || err instanceof TeamClientError;
      if (known && err.needsReauth) router.replace('/sign-in?expired=1');
      else setError(known ? err.message : genericError);
    },
    [router]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const membership = await getMyMembership();
      setWorkspaceId(membership.workspaceId);
      const opts = budgetCents === null ? {} : { budgetCents };
      setRecs(await listLowStockRecommendations(membership.workspaceId, opts));
    } catch (err) {
      fail(err);
    } finally {
      setLoading(false);
    }
  }, [fail, budgetCents]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (variantId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });

  const run = async (action: (ws: string) => Promise<void>) => {
    if (!workspaceId) return;
    setBusy(true);
    setError(null);
    try {
      await action(workspaceId);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const hide = (variantId: string, snooze: boolean) =>
    run(async (ws) => {
      const until = new Date(Date.now() + SNOOZE_DAYS * 86_400_000);
      await setRecommendationState(ws, variantId, {
        status: snooze ? 'snoozed' : 'dismissed',
        snoozedUntil: snooze ? until.toISOString() : null,
        expectedVersion: null,
      });
      setRecs((prev) => prev.filter((r) => r.variantId !== variantId));
      setSelected((prev) => new Set([...prev].filter((v) => v !== variantId)));
    });

  if (loading) return <p className="text-sm text-neutral-600">Memuat…</p>;
  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-sm text-error-800">
          {error}
        </p>
      )}
      <BudgetFilter
        budgetCents={budgetCents}
        disabled={busy}
        onApply={setBudgetCents}
      />
      {recs.length === 0 ? (
        <p className="text-sm text-neutral-600">Tidak ada stok tipis.</p>
      ) : (
        <ul data-testid="low-stock-list">
          {recs.map((rec) => (
            <LowStockRow
              key={rec.variantId}
              rec={rec}
              selected={selected.has(rec.variantId)}
              busy={busy}
              onToggle={toggle}
              onDismiss={(id) => void hide(id, false)}
              onSnooze={(id) => void hide(id, true)}
              onAmbang={setAmbangId}
            />
          ))}
        </ul>
      )}
      {workspaceId && ambangId && (
        <AmbangPanel
          workspaceId={workspaceId}
          variantId={ambangId}
          onClose={() => {
            setAmbangId(null);
            void load();
          }}
          onError={fail}
        />
      )}
      {workspaceId && (
        <ReplenishDraftSection
          workspaceId={workspaceId}
          selectedRecs={recs.filter((r) => selected.has(r.variantId))}
          disabled={busy}
          onCreated={() => setSelected(new Set())}
          onError={fail}
        />
      )}
    </div>
  );
}
