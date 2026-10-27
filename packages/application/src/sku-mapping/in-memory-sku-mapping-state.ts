import type { SkuMappingOverview } from './sku-mapping-overview-types';
import type {
  MappableListingRecord,
  SkuMappingOverviewSnapshot,
} from './sku-mapping-port-inputs';
import type {
  SkuMappingEventRecord,
  SkuMappingRecord,
} from './sku-mapping-types';

/**
 * Seedable state behind the in-memory SKU mapping fakes (UTA-40 / US03,
 * RFC 05 task 17a). Overview: in-memory-sku-mapping-overview.ts (17b);
 * reads: in-memory-sku-mapping-reads.ts (17c); writes + tx runner:
 * in-memory-sku-mapping-store.ts (17d). Rows carry their workspaceId so
 * cross-workspace reads miss like the Drizzle store.
 */

type Scoped<T> = T & { workspaceId: string };

/** Drops the workspaceId bookkeeping column from a returned copy. */
export function unscope<T extends { workspaceId: string }>(row: T) {
  const { workspaceId: _ws, ...rest } = row;
  return { ...rest };
}

export type InMemorySkuStoreRow = Scoped<SkuMappingOverview['stores'][number]>;
export type InMemorySkuVariantRow = Scoped<
  SkuMappingOverviewSnapshot['variants'][number]
>;
export type InMemorySkuListingRow = Scoped<MappableListingRecord>;

export interface InMemorySkuMappingState {
  stores: InMemorySkuStoreRow[];
  variants: InMemorySkuVariantRow[];
  /** Staged marketplace_listings joined with their connection. */
  listings: InMemorySkuListingRow[];
  mappings: SkuMappingRecord[];
  events: SkuMappingEventRecord[];
  /** userId → user_profiles.display_name (absent → use-case fallback). */
  actorNames: Record<string, string>;
  seq: number;
  now: () => Date;
}

export function createSkuMappingState(
  seed: Partial<InMemorySkuMappingState> = {}
): InMemorySkuMappingState {
  return {
    stores: [],
    variants: [],
    listings: [],
    mappings: [],
    events: [],
    actorNames: {},
    seq: 0,
    now: () => new Date(),
    ...seed,
  };
}

/** Deterministic ids (`map-1`, `evt-2`, ...) for stable test output. */
export function nextSkuMappingId(
  state: InMemorySkuMappingState,
  prefix: string
): string {
  state.seq += 1;
  return `${prefix}-${state.seq}`;
}

/** Copies the mutable rows; the returned fn restores them (rollback). */
export function snapshotSkuMappingState(
  state: InMemorySkuMappingState
): () => void {
  const copy = {
    listings: state.listings.map((l) => ({
      ...l,
      suggestedVariantIds: [...l.suggestedVariantIds],
    })),
    mappings: state.mappings.map((m) => ({ ...m })),
    events: [...state.events],
    seq: state.seq,
  };
  return () => {
    Object.assign(state, copy);
  };
}
