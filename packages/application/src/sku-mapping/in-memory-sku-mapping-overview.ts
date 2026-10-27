import {
  type InMemorySkuMappingState,
  unscope,
} from './in-memory-sku-mapping-state';
import type {
  MappableListingRecord,
  SkuMappingOverviewQueryInput,
  SkuMappingOverviewSnapshot,
} from './sku-mapping-port-inputs';
import type { SkuMappingRecord } from './sku-mapping-types';

const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();

/** The staged listing sharing the mapping's natural Store SKU key. */
export function inMemoryListingOf(
  state: InMemorySkuMappingState,
  m: SkuMappingRecord
): MappableListingRecord | null {
  const row = state.listings.find(
    (l) =>
      l.workspaceId === m.workspaceId &&
      l.channel === m.channel &&
      l.shopExtId === m.shopExtId &&
      l.platformSkuId === m.platformSkuId
  );
  return row ? unscope(row) : null;
}

/**
 * In-memory loadOverview (UTA-40 / US03, RFC 05 task 17b). Applies the
 * store-side q / connectionId / variantId scope; the review filter and
 * KPIs stay in getSkuMappingOverview. q is a case-insensitive contains
 * over SKU code, product/variant name, barcode and Store SKU hints.
 */
export function loadInMemorySkuMappingOverview(
  state: InMemorySkuMappingState,
  input: SkuMappingOverviewQueryInput
): SkuMappingOverviewSnapshot {
  const { workspaceId: ws, connectionId, variantId } = input;
  const q = norm(input.q);
  const hit = (...values: Array<string | null>) =>
    !q || values.some((v) => norm(v).includes(q));
  const inStore = (id: string | null) => !connectionId || id === connectionId;
  const mappings = state.mappings.filter(
    (m) => m.workspaceId === ws && inStore(m.connectionId)
  );
  const variants = state.variants.filter(
    (v) =>
      v.workspaceId === ws &&
      (!variantId || v.id === variantId) &&
      (hit(v.skuCode, v.productName, v.variantName, v.barcode) ||
        mappings.some(
          (m) =>
            m.variantId === v.id &&
            hit(m.sellerSkuHint, m.listingName, m.platformSkuId)
        ))
  );
  const ids = new Set(variants.map((v) => v.id));
  return {
    stores: state.stores
      .filter((s) => s.workspaceId === ws && inStore(s.connectionId))
      .map(unscope),
    variants: variants.map(unscope),
    mappings: mappings
      .filter((m) => ids.has(m.variantId))
      .map((m) => ({
        mapping: { ...m },
        listing: inMemoryListingOf(state, m),
      })),
    openListings: state.listings
      .filter(
        (l) =>
          l.workspaceId === ws &&
          inStore(l.connectionId) &&
          l.mappingState !== 'mapped' &&
          hit(l.storeSkuText, l.title, l.platformSkuId)
      )
      .map(unscope),
  };
}
