import { computeMappingStatus } from './compute-mapping-status';
import type {
  SkuMappingOverview,
  SkuMappingReviewState,
  StagedListingCandidate,
  SubordinateStoreSkuRecord,
  TokobossSkuCardRecord,
} from './sku-mapping-overview-types';
import type {
  MappableListingRecord,
  SkuMappingOverviewSnapshot,
} from './sku-mapping-port-inputs';

/**
 * Pure card builders for the Petakan Store SKU overview (UTA-40 / US03,
 * RFC 05 task 12a). getSkuMappingOverview (12b) loads the snapshot,
 * filters and counts; nothing here does I/O. SKU TokoBoss is canonical.
 */

export type OverviewVariant = SkuMappingOverviewSnapshot['variants'][number];
export type OverviewMappingRow = SkuMappingOverviewSnapshot['mappings'][number];
export type OverviewStore = SkuMappingOverview['stores'][number];

/** One mapping beneath a SKU TokoBoss with stock + lifecycle flags. */
export function buildSubordinate(
  variant: OverviewVariant,
  row: OverviewMappingRow,
  storesById: ReadonlyMap<string, OverviewStore>
): SubordinateStoreSkuRecord {
  const { mapping, listing } = row;
  const store =
    mapping.connectionId === null
      ? undefined
      : storesById.get(mapping.connectionId);
  const status = computeMappingStatus({
    totalStockQty: variant.totalStockQty,
    linkedStockQtyByConnection: variant.linkedStockQtyByConnection,
    connectionId: mapping.connectionId,
    providerStock: listing?.providerStock ?? null,
    connectionConnected:
      listing?.connectionConnected ?? store?.status === 'connected',
    listing,
    listingName: mapping.listingName,
  });
  return {
    ...mapping,
    stockConflict: status.stockConflict,
    lifecycleIssue: status.lifecycleIssue,
    storeDisplayName: listing?.storeDisplayName ?? store?.displayName ?? null,
    listingTitle: listing?.title ?? null,
    listingStatus: listing?.listingStatus ?? null,
  };
}

/** Open suggested/ambiguous listings that point at this variant. */
export function suggestionsFor(
  variantId: string,
  openListings: readonly MappableListingRecord[]
): StagedListingCandidate[] {
  return openListings.filter(
    (l) =>
      (l.mappingState === 'suggested' || l.mappingState === 'ambiguous') &&
      l.suggestedVariantIds.includes(variantId)
  );
}

/** Worst state wins: issue > conflict > needs_review > unmapped. */
export function deriveReviewState(
  mappings: readonly SubordinateStoreSkuRecord[],
  suggestionCount: number
): SkuMappingReviewState {
  const active = mappings.filter((m) => m.archivedAt === null);
  if (active.some((m) => m.lifecycleIssue !== null)) return 'issue';
  if (active.some((m) => m.stockConflict.hasStockConflict)) return 'conflict';
  if (suggestionCount > 0) return 'needs_review';
  return active.length === 0 ? 'unmapped' : 'complete';
}

export function buildCard(
  variant: OverviewVariant,
  rows: readonly OverviewMappingRow[],
  openListings: readonly MappableListingRecord[],
  storesById: ReadonlyMap<string, OverviewStore>
): TokobossSkuCardRecord {
  const mappings = rows.map((r) => buildSubordinate(variant, r, storesById));
  const suggestions = suggestionsFor(variant.id, openListings);
  return {
    variantId: variant.id,
    productId: variant.productId,
    skuCode: variant.skuCode ?? '',
    productName: variant.productName,
    variantName: variant.variantName,
    barcode: variant.barcode,
    status: variant.status,
    totalStockQty: variant.totalStockQty,
    reviewState: deriveReviewState(mappings, suggestions.length),
    mappings,
    suggestions,
  };
}
