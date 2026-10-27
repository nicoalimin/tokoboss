import type { TenancyAuditSink } from '../tenancy/tenancy-ports';
import type {
  AppendSkuMappingEventInput,
  ListingMatchStateResult,
  MappableListingRecord,
  MappableVariantRecord,
  SkuMappingOverviewQueryInput,
  SkuMappingOverviewSnapshot,
  StoreSkuKey,
  UpsertSkuMappingInput,
  UpsertSkuMappingResult,
} from './sku-mapping-port-inputs';
import type {
  SkuMappingEventRecord,
  SkuMappingHistoryEntry,
  SkuMappingRecord,
} from './sku-mapping-types';

/**
 * Ports for Story 03 SKU mapping (UTA-40 / US03, RFC 05 task 10b).
 *
 * Every method is workspace-scoped; cross-workspace misses return null
 * (use cases map them to sku-mapping-errors). SKU TokoBoss is canonical:
 * Store SKU text, title and option name are hints and never resolve a
 * mapping on their own.
 */

/** Reads outside a transaction (overview, history, guards). */
export interface SkuMappingReadStore {
  loadOverview(
    input: SkuMappingOverviewQueryInput
  ): Promise<SkuMappingOverviewSnapshot>;

  /** Newest first; joins SKU codes, store name, user_profiles name. */
  listHistory(input: {
    workspaceId: string;
    variantId?: string;
    limit: number;
  }): Promise<SkuMappingHistoryEntry[]>;

  findVariant(
    workspaceId: string,
    variantId: string
  ): Promise<MappableVariantRecord | null>;

  findListing(
    workspaceId: string,
    listingId: string
  ): Promise<MappableListingRecord | null>;

  /** Live mapping by id + its staged listing (null: row left staging). */
  findMapping(
    workspaceId: string,
    mappingId: string
  ): Promise<{
    mapping: SkuMappingRecord;
    listing: MappableListingRecord | null;
  } | null>;
}

/** Writes; the Drizzle store runs them on one Postgres transaction. */
export interface SkuMappingStore {
  /** Row-locked lookup of the live (non-archived) mapping for a key. */
  findMappingByStoreSku(key: StoreSkuKey): Promise<SkuMappingRecord | null>;

  /** Stale expectedVersion → skuMappingVersionConflict (409). */
  upsertMapping(input: UpsertSkuMappingInput): Promise<UpsertSkuMappingResult>;

  /** Archives the mapping; null when absent or already archived. */
  deleteMapping(
    workspaceId: string,
    mappingId: string
  ): Promise<SkuMappingRecord | null>;

  setListingMapped(workspaceId: string, listingId: string): Promise<void>;

  /** Re-run suggestListingMatches for one listing and persist it. */
  recomputeListingMatchState(
    workspaceId: string,
    listingId: string
  ): Promise<ListingMatchStateResult>;

  appendHistoryEvent(
    input: AppendSkuMappingEventInput
  ): Promise<SkuMappingEventRecord>;
}

/** Commits mapping, listing state and history atomically (AC5). */
export interface SkuMappingTxRunner {
  run<T>(fn: (store: SkuMappingStore) => Promise<T>): Promise<T>;
}

/** Use-case deps; audit actions sku_mapping.*, category 'workspace'. */
export interface SkuMappingDeps {
  reads: SkuMappingReadStore;
  tx: SkuMappingTxRunner;
  audit: Pick<TenancyAuditSink, 'append'>;
}
