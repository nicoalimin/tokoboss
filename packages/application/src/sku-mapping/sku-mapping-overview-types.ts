import type {
  MarketplaceConnectionStatus,
  MarketplaceProvider,
} from '@tokoboss/domain';
import type { CatalogStatus } from '../catalog/catalog-types';
import type { ListingRowView } from '../integrations/integration-types';
import type { SkuMappingRecord } from './sku-mapping-types';

/**
 * Story 03 SKU mapping overview read models (UTA-40 / US03, RFC 05 task
 * 8b): pre-sync stock conflict, lifecycle drift, SKU TokoBoss cards and
 * the Petakan Store SKU overview. Records only (dates are Date).
 */

export type SkuMappingLifecycleIssue =
  | 'listing_missing'
  | 'listing_deleted'
  | 'listing_paused'
  | 'listing_inactive'
  | 'connection_disconnected'
  | 'title_renamed';

export type SkuMappingStockScope =
  'linked_warehouses' | 'all_active_warehouses';

export type SkuMappingReviewState =
  'complete' | 'needs_review' | 'unmapped' | 'conflict' | 'issue';

/** Pre-sync stock comparison for one mapped Store SKU (before Story 04). */
export interface StockConflictPreview {
  tokobossStockQty: number;
  stockScope: SkuMappingStockScope;
  providerStock: number | null;
  hasStockConflict: boolean;
  stockDelta: number | null;
}

/** A mapping enriched with its staged listing, store and drift flags. */
export interface SubordinateStoreSkuRecord extends SkuMappingRecord {
  stockConflict: StockConflictPreview;
  storeDisplayName: string | null;
  listingTitle: string | null;
  listingStatus: string | null;
  lifecycleIssue: SkuMappingLifecycleIssue | null;
}

/** A staged listing that can be mapped (suggestion or unassigned pick). */
export interface StagedListingCandidate extends ListingRowView {
  listingId: string;
  channel: MarketplaceProvider;
  storeDisplayName: string | null;
  candidateSkuCodes: string[];
}

/** One canonical SKU TokoBoss card with its subordinate Store SKUs. */
export interface TokobossSkuCardRecord {
  variantId: string;
  productId: string;
  skuCode: string;
  productName: string;
  variantName: string | null;
  barcode: string | null;
  status: CatalogStatus;
  totalStockQty: number;
  reviewState: SkuMappingReviewState;
  mappings: SubordinateStoreSkuRecord[];
  suggestions: StagedListingCandidate[];
}

/** GET sku-mappings overview: KPIs, store slots, cards, open listings. */
export interface SkuMappingOverview {
  summary: {
    mappedStoreSkusCount: number;
    needsReviewCount: number;
    unmappedStoreSkusCount: number;
    unmappedTokobossSkusCount: number;
    stockConflictCount: number;
  };
  stores: Array<{
    connectionId: string;
    provider: MarketplaceProvider;
    providerStoreId: string;
    displayName: string | null;
    status: MarketplaceConnectionStatus;
  }>;
  items: TokobossSkuCardRecord[];
  unassignedListings: StagedListingCandidate[];
}
