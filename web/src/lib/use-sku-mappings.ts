'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  SkuMappingHistoryEventView,
  SkuMappingOverviewQuery,
  SkuMappingOverviewResponse,
} from '@tokoboss/contracts';
import {
  fetchSkuMappingHistory,
  fetchSkuMappingOverview,
} from './sku-mapping-client';
import {
  useInventorySync,
  type InventorySyncState,
} from './use-inventory-sync';
import {
  useSkuMappingActions,
  type SkuMappingActions,
} from './use-sku-mapping-actions';

/**
 * Petakan Store SKU state hook (US03 / RFC 05 task 32b): overview (32a
 * writes reload it) + mapping history for the current filters (q, filter
 * chip, store, SKU TokoBoss focus). A filter change or a successful write
 * reloads both; stale responses are dropped. `bulkItems` lists the
 * unambiguous suggestions (one candidate) for the "Petakan otomatis" CTA.
 * A failed read sets `failed`; `retry` reloads. Feeds row 39
 * SkuMappingPanel; no copy, no markup.
 */

export interface SkuMappingsData {
  overview: SkuMappingOverviewResponse | null;
  history: SkuMappingHistoryEventView[];
  loading: boolean;
  failed: boolean;
}

export interface SkuMappingsState extends SkuMappingsData, SkuMappingActions {
  filters: SkuMappingOverviewQuery;
  setFilters: (patch: Partial<SkuMappingOverviewQuery>) => void;
  bulkItems: { listingId: string; variantId: string }[];
  retry: () => void;
  /** Story 04 sync states + Perlu tindakan (RFC 06 row 50b). */
  sync?: InventorySyncState;
}

const START: SkuMappingsData = {
  overview: null,
  history: [],
  loading: true,
  failed: false,
};

export function useSkuMappings(
  workspaceId: string,
  initialFilters: SkuMappingOverviewQuery = {}
): SkuMappingsState {
  const [filters, setFilterState] = useState(initialFilters);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<SkuMappingsData>(START);
  const generation = useRef(0);
  const { q, filter, connectionId, variantId } = filters;

  useEffect(() => {
    const gen = ++generation.current;
    setData((d) => ({ ...d, loading: true }));
    const query = { q, filter, connectionId, variantId };
    Promise.all([
      fetchSkuMappingOverview(workspaceId, query),
      fetchSkuMappingHistory(workspaceId, { variantId }),
    ])
      .then(([overview, history]) => {
        if (gen !== generation.current) return;
        setData({ overview, history, loading: false, failed: false });
      })
      .catch(() => {
        if (gen !== generation.current) return;
        setData((d) => ({ ...d, loading: false, failed: true }));
      });
  }, [workspaceId, q, filter, connectionId, variantId, attempt]);

  const reload = () => setAttempt((n) => n + 1);
  const actions = useSkuMappingActions(workspaceId, reload);

  const setFilters = (patch: Partial<SkuMappingOverviewQuery>) =>
    setFilterState((f) => ({ ...f, ...patch }));

  const bulkItems = (data.overview?.items ?? []).flatMap((card) =>
    card.suggestions
      .filter(
        (s) =>
          s.mappingState === 'suggested' &&
          s.suggestedVariantIds.length === 1 &&
          s.suggestedVariantIds[0] === card.variantId
      )
      .map((s) => ({ listingId: s.listingId, variantId: card.variantId }))
  );

  const ids = data.overview?.items.map((i) => i.variantId) ?? null;
  const sync = useInventorySync(workspaceId, ids);
  const retry = reload;
  return { ...data, ...actions, filters, setFilters, bulkItems, retry, sync };
}
