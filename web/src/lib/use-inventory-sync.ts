'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  InventorySyncAttentionItem,
  MappingSyncStateView,
} from '@tokoboss/contracts';
import {
  fetchInventorySyncOverview,
  patchMappingSyncSettings,
  postMappingSyncRetry,
  type MappingSyncSettingsPatch,
} from './inventory-sync-client';

/**
 * Story 04 inventory sync hook (UTA-37 / US04, RFC 06 row 50a): sync states
 * (by mappingId) + Perlu tindakan list for the visible SKU TokoBoss ids (null
 * → wait). onChange (PATCH) / onSync (Sinkronkan sekarang · Coba lagi) run
 * one at a time, then reload; remediate sends reauth / warehouse fixes to
 * the store page. A failed read keeps the last data. No copy, no markup.
 */

export interface InventorySyncHandlers {
  states: Record<string, MappingSyncStateView>;
  busyMappingId: string | null;
  onChange: (mappingId: string, patch: MappingSyncSettingsPatch) => void;
  onSync: (mappingId: string) => void;
}

export interface InventorySyncState extends InventorySyncHandlers {
  attention: InventorySyncAttentionItem[];
  failed: boolean;
  remediate: (item: InventorySyncAttentionItem) => void;
}

const RETRY: string[] = ['retry_now', 'check_listing'];

export function useInventorySync(
  workspaceId: string,
  variantIds: string[] | null
): InventorySyncState {
  const [states, setStates] = useState<InventorySyncHandlers['states']>({});
  const [attention, setAttention] = useState<InventorySyncAttentionItem[]>([]);
  const [failed, setFailed] = useState(false);
  const [busyMappingId, setBusy] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const key = variantIds?.join() ?? null;

  useEffect(() => {
    if (key === null) return;
    const gen = ++generation.current;
    const ids = key ? key.split(',') : [];
    fetchInventorySyncOverview(workspaceId, { variantIds: ids })
      .then((o) => {
        if (gen !== generation.current) return;
        setStates(Object.fromEntries(o.states.map((s) => [s.mappingId, s])));
        setAttention(o.attention);
        setFailed(false);
      })
      .catch(() => gen === generation.current && setFailed(true));
  }, [workspaceId, key, attempt]);

  const run = (mappingId: string, call: () => Promise<unknown>) => {
    if (busyMappingId) return;
    setBusy(mappingId);
    call()
      .catch(() => setFailed(true))
      .finally(() => {
        setBusy(null);
        setAttempt((n) => n + 1);
      });
  };

  const onSync = (mappingId: string) =>
    run(mappingId, () => postMappingSyncRetry(workspaceId, mappingId));
  const onChange = (mappingId: string, patch: MappingSyncSettingsPatch) =>
    run(mappingId, () =>
      patchMappingSyncSettings(workspaceId, mappingId, patch)
    );

  const remediate = (item: InventorySyncAttentionItem) => {
    if (RETRY.includes(item.remediation)) return onSync(item.mappingId);
    const conn = states[item.mappingId]?.connectionId;
    const base = `/w/${encodeURIComponent(workspaceId)}/integrasi`;
    window.location.assign(conn ? `${base}/${encodeURIComponent(conn)}` : base);
  };

  return {
    states,
    attention,
    failed,
    busyMappingId,
    onChange,
    onSync,
    remediate,
  };
}
