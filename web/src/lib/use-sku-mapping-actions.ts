'use client';

import { useState } from 'react';
import type { BulkMapStoreSkusBody } from '@tokoboss/contracts';
import {
  bulkMapStoreSkusClient,
  mapStoreSkuClient,
  unmapStoreSkuClient,
  type MapStoreSkuInput,
  type MapStoreSkuResult,
} from './sku-mapping-client';
import { SkuMappingClientError } from './sku-mapping-request';

/**
 * SKU mapping write actions (US03 / RFC 05 task 32a, CoS split of row 32):
 * map / remap one Store SKU, bulk-map unambiguous suggestions and unmap.
 * One write at a time (`busy`); a success calls `onChanged` so the row 32b
 * hook reloads overview + history. A failure keeps the typed
 * `SkuMappingClientError` (409 remap prompt / 422 ambiguous `details`) for
 * the row 37 dialog. Admin/Manager only; the server stays the role
 * boundary (Staff gets 403). No copy, no markup.
 */

export type SkuMappingWrite = 'map' | 'bulk' | 'unmap';

export interface SkuMappingActions {
  /** The write in flight, or null. */
  busy: SkuMappingWrite | null;
  error: SkuMappingClientError | null;
  map: (input: MapStoreSkuInput) => Promise<MapStoreSkuResult | null>;
  bulkMap: (items: BulkMapStoreSkusBody['items']) => Promise<number | null>;
  unmap: (mappingId: string) => Promise<boolean>;
  clearError: () => void;
}

function asClientError(err: unknown): SkuMappingClientError {
  if (err instanceof SkuMappingClientError) return err;
  return new SkuMappingClientError(0, 'SKU_MAPPING_FAILED');
}

export function useSkuMappingActions(
  workspaceId: string,
  onChanged: () => void
): SkuMappingActions {
  const [busy, setBusy] = useState<SkuMappingWrite | null>(null);
  const [error, setError] = useState<SkuMappingClientError | null>(null);

  async function run<T>(kind: SkuMappingWrite, call: () => Promise<T>) {
    if (busy) return null;
    setBusy(kind);
    setError(null);
    try {
      const result = await call();
      onChanged();
      return result;
    } catch (err) {
      setError(asClientError(err));
      return null;
    } finally {
      setBusy(null);
    }
  }

  const map = (input: MapStoreSkuInput) =>
    run('map', () => mapStoreSkuClient(workspaceId, input));

  const bulkMap = async (items: BulkMapStoreSkusBody['items']) => {
    if (items.length === 0) return 0;
    const res = await run('bulk', () =>
      bulkMapStoreSkusClient(workspaceId, { items })
    );
    return res ? res.mappedCount : null;
  };

  const unmap = async (mappingId: string) => {
    const res = await run('unmap', () =>
      unmapStoreSkuClient(workspaceId, mappingId)
    );
    return res !== null;
  };

  return { busy, error, map, bulkMap, unmap, clearError: () => setError(null) };
}
