import type {
  ConnectedStoreSlotView,
  SkuMappingOverviewResponse,
  StagedListingCandidateView,
  SubordinateStoreSkuView,
} from '@tokoboss/contracts';

/** Static data for the Petakan Store SKU UI tests (RFC 05 task 50a). */

export const WS = 'ws-50';
export const VAR_A = 'var-50a';
export const VAR_B = 'var-50b';

const store = (connectionId: string, provider: 'shopee' | 'tiktok_shop') =>
  ({
    connectionId,
    provider,
    providerStoreId: `${connectionId}-ext`,
    displayName: `Toko ${connectionId}`,
    status: 'connected',
  }) satisfies ConnectedStoreSlotView;

export const SLOT: SubordinateStoreSkuView = {
  mappingId: 'map-50',
  variantId: VAR_A,
  connectionId: 'sp',
  storeDisplayName: 'Toko sp',
  channel: 'shopee',
  shopExtId: 'sp-ext',
  externalItemId: 'item-50',
  platformSkuId: 'plat-50',
  storeSkuText: 'SP-KAOS-M',
  listingTitle: 'Kaos Polos',
  variantName: 'M',
  listingStatus: 'active',
  providerStock: 10,
  tokobossStockQty: 12,
  stockScope: 'linked_warehouses',
  hasStockConflict: true,
  stockDelta: -2,
  lifecycleIssue: null,
  version: 1,
  updatedAt: '2026-10-28T00:00:00.000Z',
};

const candidate = (
  listingId: string,
  connectionId: string,
  sku: string,
  variantIds: string[]
): StagedListingCandidateView => ({
  listingId,
  connectionId,
  storeDisplayName: `Toko ${connectionId}`,
  channel: connectionId === 'tt' ? 'tiktok_shop' : 'shopee',
  externalItemId: `item-${listingId}`,
  platformSkuId: `plat-${listingId}`,
  storeSkuText: sku,
  title: 'Kaos Polos',
  variantName: null,
  listingStatus: 'active',
  providerStock: 5,
  mappingState: variantIds.length > 1 ? 'ambiguous' : 'suggested',
  suggestedVariantIds: variantIds,
  candidateSkuCodes: variantIds.map((v) => v.toUpperCase()),
});

export const AMBIG = candidate('lst-amb', 'tt', 'TT-KAOS', [VAR_A, VAR_B]);
export const SUGG = candidate('lst-sug', 'sp', 'SP-KAOS-L', [VAR_B]);

const card = (variantId: string, skuCode: string) => ({
  variantId,
  productId: 'prod-50',
  skuCode,
  productName: 'Kaos Polos',
  variantName: skuCode.slice(-1),
  barcode: null,
  status: 'active' as const,
  totalStockQty: 12,
});

export const OVERVIEW: SkuMappingOverviewResponse = {
  summary: {
    mappedStoreSkusCount: 7,
    needsReviewCount: 3,
    unmappedStoreSkusCount: 5,
    unmappedTokobossSkusCount: 1,
    stockConflictCount: 1,
  },
  stores: [store('sp', 'shopee'), store('tt', 'tiktok_shop')],
  items: [
    {
      ...card(VAR_A, 'KAOS-M'),
      reviewState: 'needs_review',
      mappings: [SLOT],
      suggestions: [AMBIG],
    },
    {
      ...card(VAR_B, 'KAOS-L'),
      reviewState: 'unmapped',
      mappings: [],
      suggestions: [SUGG, AMBIG],
    },
  ],
  unassignedListings: [],
};

export const BULK = [{ listingId: SUGG.listingId, variantId: VAR_B }];
