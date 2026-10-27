import { suggestListingMatches } from '../integrations/suggest-listing-matches';
import {
  type InMemorySkuListingRow,
  type InMemorySkuMappingState,
  nextSkuMappingId,
} from './in-memory-sku-mapping-state';
import { skuMappingVersionConflict } from './sku-mapping-errors';
import type {
  ListingMatchStateResult,
  StoreSkuKey,
  UpsertSkuMappingInput,
  UpsertSkuMappingResult,
} from './sku-mapping-port-inputs';
import type { SkuMappingRecord } from './sku-mapping-types';

/**
 * Write helpers for InMemorySkuMappingStore (UTA-40 / US03, RFC 05 task
 * 17d): Store SKU key lookup, upsert/restore/repoint and the listing
 * match recompute. They mutate the seedable state (17a) in place.
 */

/** Any row (live or archived) with the natural Store SKU key. */
export function inMemoryMappingByKey(
  state: InMemorySkuMappingState,
  key: StoreSkuKey
): SkuMappingRecord | undefined {
  return state.mappings.find(
    (m) =>
      m.workspaceId === key.workspaceId &&
      m.channel === key.channel &&
      m.shopExtId === key.shopExtId &&
      m.platformSkuId === key.platformSkuId
  );
}

/** New → v1; restore or repoint → version + 1; same variant keeps it. */
export function inMemoryUpsertMapping(
  state: InMemorySkuMappingState,
  input: UpsertSkuMappingInput
): UpsertSkuMappingResult {
  const { expectedVersion, ...fields } = input;
  const row = inMemoryMappingByKey(state, input);
  const now = state.now();
  if (!row) {
    const id = nextSkuMappingId(state, 'map');
    const mapping: SkuMappingRecord = {
      ...fields,
      ...{ id, version: 1, archivedAt: null, createdAt: now, updatedAt: now },
    };
    state.mappings.push(mapping);
    return { mapping: { ...mapping }, previous: null };
  }
  const live = row.archivedAt === null;
  const repoint = live && row.variantId !== input.variantId;
  if (repoint && expectedVersion !== row.version) {
    throw skuMappingVersionConflict(row.version);
  }
  const previous = live ? { ...row } : null;
  const version = live && !repoint ? row.version : row.version + 1;
  Object.assign(row, fields, { archivedAt: null, updatedAt: now, version });
  return { mapping: { ...row }, previous };
}

/** suggestListingMatches over the listing's whole store, persisted. */
export function inMemoryRecomputeListing(
  state: InMemorySkuMappingState,
  row: InMemorySkuListingRow
): ListingMatchStateResult {
  const ws = row.workspaceId;
  const mappedPlatformSkuIds = new Set(
    state.mappings
      .filter((m) => m.workspaceId === ws && m.archivedAt === null)
      .filter((m) => m.channel === row.channel && m.shopExtId === row.shopExtId)
      .map((m) => m.platformSkuId)
  );
  const match = suggestListingMatches({
    listings: state.listings.filter(
      (l) => l.workspaceId === ws && l.connectionId === row.connectionId
    ),
    variants: state.variants.filter(
      (v) => v.workspaceId === ws && v.archivedAt === null
    ),
    mappedPlatformSkuIds,
  }).find((m) => m.platformSkuId === row.platformSkuId);
  const mappingState = match?.mappingState ?? 'unmapped';
  const suggestedVariantIds = match?.suggestedVariantIds ?? [];
  Object.assign(row, { mappingState, suggestedVariantIds });
  return { mappingState, suggestedVariantIds: [...suggestedVariantIds] };
}
