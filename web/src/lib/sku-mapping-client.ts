/**
 * Browser client for the US03 SKU mapping Route Handlers (UTA-40, RFC 05
 * task 31b), built on `skuMappingRequest` (31a): overview and history
 * reads (every member) plus map / remap, bulk-map and unmap writes
 * (Admin or Manager; Staff gets a 403 `SkuMappingClientError`). A 409
 * remap prompt or 422 ambiguous batch keeps the route `details`.
 */
import type {
  BulkMapStoreSkusBody,
  IntegrationListingMappingState,
  SkuMappingHistoryEventView,
  SkuMappingOverviewQuery,
  SkuMappingOverviewResponse,
  SubordinateStoreSkuView,
} from '@tokoboss/contracts';
import {
  skuMappingRequest,
  skuMappingsPath,
  type FetchFn,
} from './sku-mapping-request';

export interface MapStoreSkuInput {
  variantId: string;
  listingId: string;
  source?: 'manual' | 'suggested_single';
  allowRemap?: boolean;
  expectedVersion?: number;
}

export interface MapStoreSkuResult {
  mapping: SubordinateStoreSkuView | null;
  outcome: 'mapped' | 'remapped' | 'restored' | 'unchanged';
}

/** GET the Petakan Store SKU overview (search / filter / store / SKU). */
export async function fetchSkuMappingOverview(
  workspaceId: string,
  query: SkuMappingOverviewQuery = {},
  fetchFn: FetchFn = fetch
): Promise<SkuMappingOverviewResponse> {
  const path = skuMappingsPath(workspaceId, [], { ...query });
  return skuMappingRequest<SkuMappingOverviewResponse>(path, {}, fetchFn);
}

/** POST map (201) or remap (`allowRemap` + `expectedVersion`, 200). */
export async function mapStoreSkuClient(
  workspaceId: string,
  input: MapStoreSkuInput,
  fetchFn: FetchFn = fetch
): Promise<MapStoreSkuResult> {
  const path = skuMappingsPath(workspaceId);
  const init = { method: 'POST', body: input };
  return skuMappingRequest<MapStoreSkuResult>(path, init, fetchFn);
}

/** POST bulk-map unambiguous suggestions (1-200 items, atomic). */
export async function bulkMapStoreSkusClient(
  workspaceId: string,
  body: BulkMapStoreSkusBody,
  fetchFn: FetchFn = fetch
): Promise<{ mappedCount: number; mappings: SubordinateStoreSkuView[] }> {
  const path = skuMappingsPath(workspaceId, ['bulk']);
  const init = { method: 'POST', body };
  return skuMappingRequest(path, init, fetchFn);
}

/** DELETE one mapping; the staged listing's suggestion is recomputed. */
export async function unmapStoreSkuClient(
  workspaceId: string,
  mappingId: string,
  fetchFn: FetchFn = fetch
): Promise<{
  deleted: boolean;
  recomputedMappingState: IntegrationListingMappingState | null;
}> {
  const path = skuMappingsPath(workspaceId, [mappingId]);
  return skuMappingRequest(path, { method: 'DELETE' }, fetchFn);
}

/** GET mapping history, newest first (optional SKU TokoBoss, limit). */
export async function fetchSkuMappingHistory(
  workspaceId: string,
  query: { variantId?: string; limit?: number } = {},
  fetchFn: FetchFn = fetch
): Promise<SkuMappingHistoryEventView[]> {
  const path = skuMappingsPath(workspaceId, ['history'], query);
  const data = await skuMappingRequest<{
    events?: SkuMappingHistoryEventView[];
  }>(path, {}, fetchFn);
  return Array.isArray(data.events) ? data.events : [];
}
