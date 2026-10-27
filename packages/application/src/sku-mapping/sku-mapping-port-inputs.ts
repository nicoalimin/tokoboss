import type { MarketplaceProvider } from '@tokoboss/domain';
import type { CatalogStatus } from '../catalog/catalog-types';
import type { ListingMappingState } from '../integrations/integration-types';
import type {
  SkuMappingOverview,
  StagedListingCandidate,
} from './sku-mapping-overview-types';
import type {
  SkuMappingEventRecord,
  SkuMappingRecord,
} from './sku-mapping-types';

/**
 * Input/result shapes for the SKU mapping stores (UTA-40 / US03, RFC 05
 * task 10a). The ports themselves: sku-mapping-ports.ts (task 10b).
 */

/** Natural key of a Store SKU inside one workspace (AC2 uniqueness). */
export interface StoreSkuKey {
  workspaceId: string;
  channel: MarketplaceProvider;
  shopExtId: string;
  platformSkuId: string;
}

/** A catalog variant as the map/bulk-map guards see it. */
export interface MappableVariantRecord {
  id: string;
  productId: string;
  skuCode: string | null;
  barcode: string | null;
  status: CatalogStatus;
  archivedAt: Date | null;
}

/** A staged listing joined with its connection (guards + hints). */
export interface MappableListingRecord extends StagedListingCandidate {
  shopExtId: string;
  connectionConnected: boolean;
}

/** Overview read scope; the review-state filter runs in the use case. */
export interface SkuMappingOverviewQueryInput {
  workspaceId: string;
  q?: string;
  connectionId?: string;
  variantId?: string;
}

/** Raw rows the overview use case assembles into a SkuMappingOverview. */
export interface SkuMappingOverviewSnapshot {
  stores: SkuMappingOverview['stores'];
  variants: Array<
    MappableVariantRecord & {
      productName: string;
      variantName: string | null;
      totalStockQty: number;
      /** connectionId → on-hand in that store's linked warehouses. */
      linkedStockQtyByConnection: Record<string, number>;
    }
  >;
  mappings: Array<{
    mapping: SkuMappingRecord;
    listing: MappableListingRecord | null;
  }>;
  /** Staged listings not yet mapped (suggested/ambiguous/unmapped). */
  openListings: MappableListingRecord[];
}

/** Insert or (re)point one catalog_channel_mappings row. */
export interface UpsertSkuMappingInput extends StoreSkuKey {
  variantId: string;
  connectionId: string;
  externalItemId: string | null;
  sellerSkuHint: string | null;
  barcodeHint: string | null;
  listingName: string | null;
  variantName: string | null;
  mappedBy: string;
  /** Required to repoint an existing mapping; stale → version conflict. */
  expectedVersion?: number;
}

export interface UpsertSkuMappingResult {
  mapping: SkuMappingRecord;
  /** The row before this write (remap) or null (first map / restore). */
  previous: SkuMappingRecord | null;
}

export type AppendSkuMappingEventInput = Omit<
  SkuMappingEventRecord,
  'id' | 'createdAt'
>;

/** Listing match state after an unmap (via suggestListingMatches). */
export interface ListingMatchStateResult {
  mappingState: ListingMappingState;
  suggestedVariantIds: string[];
}
