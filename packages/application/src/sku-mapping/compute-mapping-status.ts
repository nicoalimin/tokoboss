import type {
  SkuMappingLifecycleIssue,
  StockConflictPreview,
} from './sku-mapping-overview-types';

/**
 * Pure status helpers for mapped Store SKUs (UTA-40 / US03, RFC 05 task
 * 11): pre-sync stock conflict and listing lifecycle drift. Read-only
 * hints; they never block or change the canonical SKU TokoBoss.
 */

export interface StockConflictInput {
  /** On-hand across all active warehouses in the workspace. */
  totalStockQty: number;
  /** connectionId → on-hand in that store's active linked warehouses. */
  linkedStockQtyByConnection: Record<string, number>;
  connectionId: string | null;
  /** marketplace_listings.provider_stock; null when unknown. */
  providerStock: number | null;
}

/** Linked warehouses win when the store has any; else all active. */
export function computeStockConflict(
  input: StockConflictInput
): StockConflictPreview {
  const linked =
    input.connectionId === null
      ? undefined
      : input.linkedStockQtyByConnection[input.connectionId];
  const tokobossStockQty = linked ?? input.totalStockQty;
  const { providerStock } = input;
  return {
    tokobossStockQty,
    stockScope:
      linked === undefined ? 'all_active_warehouses' : 'linked_warehouses',
    providerStock,
    hasStockConflict:
      providerStock !== null && providerStock !== tokobossStockQty,
    stockDelta:
      providerStock === null ? null : tokobossStockQty - providerStock,
  };
}

export interface LifecycleIssueInput {
  /** False when the store is not 'connected' or is archived. */
  connectionConnected: boolean;
  /** The staged listing; null when it is gone from staging. */
  listing: { listingStatus: string | null; title: string | null } | null;
  /** catalog_channel_mappings.listing_name captured at map time. */
  listingName: string | null;
}

const STATUS_ISSUES: Record<string, SkuMappingLifecycleIssue> = {
  deleted: 'listing_deleted',
  paused: 'listing_paused',
  inactive: 'listing_inactive',
  archived: 'listing_inactive',
};

/**
 * First matching drift flag, most severe first: disconnected store,
 * missing listing, deleted/paused/inactive listing, renamed title.
 */
export function computeLifecycleIssue(
  input: LifecycleIssueInput
): SkuMappingLifecycleIssue | null {
  if (!input.connectionConnected) return 'connection_disconnected';
  const { listing } = input;
  if (listing === null) return 'listing_missing';
  const status = listing.listingStatus?.trim().toLowerCase() ?? '';
  const statusIssue = STATUS_ISSUES[status];
  if (statusIssue !== undefined) return statusIssue;
  const title = listing.title?.trim() ?? '';
  const named = input.listingName?.trim() ?? '';
  if (title !== '' && named !== '' && title !== named) return 'title_renamed';
  return null;
}

/** Both flags for one subordinate Store SKU row. */
export function computeMappingStatus(
  input: StockConflictInput & LifecycleIssueInput
): {
  stockConflict: StockConflictPreview;
  lifecycleIssue: SkuMappingLifecycleIssue | null;
} {
  return {
    stockConflict: computeStockConflict(input),
    lifecycleIssue: computeLifecycleIssue(input),
  };
}
