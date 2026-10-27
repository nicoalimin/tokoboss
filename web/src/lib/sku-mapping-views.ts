/**
 * SKU mapping record → wire view mappers (UTA-40 / US03, RFC 05 task
 * 25c). Mirrors `@/lib/stock-count-views`. Contract views are strict, so
 * each mapper copies an explicit allow-list: no workspaceId, barcodeHint,
 * lastSeenAt, correlationId or mappedBy reaches the client; Dates become
 * ISO strings.
 */
import type {
  SkuMappingHistoryEntry,
  SkuMappingOverview,
  StagedListingCandidate,
  SubordinateStoreSkuRecord,
  TokobossSkuCardRecord,
} from '@tokoboss/application';
import type {
  SkuMappingHistoryEventView,
  SkuMappingOverviewResponse,
  StagedListingCandidateView,
  SubordinateStoreSkuView,
  TokobossSkuMappingCardView,
} from '@tokoboss/contracts';

export function toSubordinateStoreSkuView(
  m: SubordinateStoreSkuRecord
): SubordinateStoreSkuView {
  const s = m.stockConflict;
  return {
    mappingId: m.id,
    variantId: m.variantId,
    connectionId: m.connectionId,
    storeDisplayName: m.storeDisplayName,
    channel: m.channel,
    shopExtId: m.shopExtId,
    externalItemId: m.externalItemId,
    platformSkuId: m.platformSkuId,
    storeSkuText: m.sellerSkuHint,
    listingTitle: m.listingTitle ?? m.listingName,
    variantName: m.variantName,
    listingStatus: m.listingStatus,
    providerStock: s.providerStock,
    tokobossStockQty: s.tokobossStockQty,
    stockScope: s.stockScope,
    hasStockConflict: s.hasStockConflict,
    stockDelta: s.stockDelta,
    lifecycleIssue: m.lifecycleIssue,
    version: m.version,
    updatedAt: m.updatedAt.toISOString(),
  };
}

export function toStagedListingCandidateView(
  l: StagedListingCandidate
): StagedListingCandidateView {
  return {
    listingId: l.listingId,
    connectionId: l.connectionId,
    storeDisplayName: l.storeDisplayName,
    channel: l.channel,
    externalItemId: l.externalItemId,
    platformSkuId: l.platformSkuId,
    storeSkuText: l.storeSkuText,
    title: l.title,
    variantName: l.variantName,
    listingStatus: l.listingStatus,
    providerStock: l.providerStock,
    mappingState: l.mappingState,
    suggestedVariantIds: [...l.suggestedVariantIds],
    candidateSkuCodes: [...l.candidateSkuCodes],
  };
}

function toCardView(c: TokobossSkuCardRecord): TokobossSkuMappingCardView {
  return {
    ...c,
    mappings: c.mappings.map(toSubordinateStoreSkuView),
    suggestions: c.suggestions.map(toStagedListingCandidateView),
  };
}

export function toSkuMappingOverviewResponse(
  o: SkuMappingOverview
): SkuMappingOverviewResponse {
  return {
    summary: { ...o.summary },
    stores: o.stores.map((s) => ({ ...s })),
    items: o.items.map(toCardView),
    unassignedListings: o.unassignedListings.map(toStagedListingCandidateView),
  };
}

export function toSkuMappingHistoryEventView(
  e: SkuMappingHistoryEntry
): SkuMappingHistoryEventView {
  const { workspaceId, mappingId, connectionId, correlationId, ...rest } = e;
  void [workspaceId, mappingId, connectionId, correlationId];
  return { ...rest, createdAt: e.createdAt.toISOString() };
}
