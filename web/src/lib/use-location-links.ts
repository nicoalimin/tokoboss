'use client';

import { useEffect, useRef, useState } from 'react';
import type { IntegrationLocationLinkView } from '@tokoboss/contracts';
import { listWarehouses, type WarehouseView } from './catalog-client';
import { listIntegrationLocationLinks } from './integrations-listings-client';
import { setIntegrationLocationLink } from './integrations-setup-client';

/**
 * Pilih gudang sumber data for one connection (US20 / RFC 04 task 121k):
 * provider locations (121i GET; null warehouseId = not linked) and the
 * select's warehouses (active, plus any still linked). `link` PUTs one row
 * (Admin only; null clears), patches it on success and tracks per-row
 * `saves`. A failed read sets `failed`; `retry` reloads; stale responses
 * are dropped. Feeds 121l LocationLinks; no copy, no markup.
 */

export type LocationSaveState = 'saving' | 'saved' | 'failed';

export interface LocationLinksData {
  locations: IntegrationLocationLinkView[];
  warehouses: WarehouseView[];
  loading: boolean;
  failed: boolean;
}

export interface LocationLinksState extends LocationLinksData {
  /** By externalLocationId; missing = idle. */
  saves: Record<string, LocationSaveState>;
  linkedCount: number;
  link: (externalLocationId: string, warehouseId: string | null) => void;
  retry: () => void;
}

const START: LocationLinksData = {
  locations: [],
  warehouses: [],
  loading: true,
  failed: false,
};

export function useLocationLinks(
  workspaceId: string,
  connectionId: string
): LocationLinksState {
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<LocationLinksData>(START);
  const [saves, setSaves] = useState<Record<string, LocationSaveState>>({});
  const generation = useRef(0);

  useEffect(() => {
    const gen = ++generation.current;
    Promise.all([
      listIntegrationLocationLinks(workspaceId, connectionId),
      listWarehouses(workspaceId),
    ])
      .then(([{ locations }, all]) => {
        if (gen !== generation.current) return;
        const linked = new Set(locations.map((l) => l.warehouseId));
        const warehouses = all.filter(
          (w) => w.status === 'active' || linked.has(w.id)
        );
        setData({ locations, warehouses, loading: false, failed: false });
      })
      .catch(() => {
        if (gen !== generation.current) return;
        setData({ ...START, loading: false, failed: true });
      });
  }, [workspaceId, connectionId, attempt]);

  const retry = () => {
    setData(START);
    setSaves({});
    setAttempt((n) => n + 1);
  };

  const link = (id: string, warehouseId: string | null) => {
    if (saves[id] === 'saving') return;
    const gen = generation.current;
    setSaves((s) => ({ ...s, [id]: 'saving' }));
    setIntegrationLocationLink(workspaceId, connectionId, id, warehouseId)
      .then((saved) => {
        if (gen !== generation.current) return;
        setData((d) => ({
          ...d,
          locations: d.locations.map((l) =>
            l.externalLocationId === id ? { ...l, ...saved } : l
          ),
        }));
        setSaves((s) => ({ ...s, [id]: 'saved' }));
      })
      .catch(() => {
        if (gen !== generation.current) return;
        setSaves((s) => ({ ...s, [id]: 'failed' }));
      });
  };

  const linkedCount = data.locations.filter((l) => l.warehouseId).length;
  return { ...data, saves, linkedCount, link, retry };
}
