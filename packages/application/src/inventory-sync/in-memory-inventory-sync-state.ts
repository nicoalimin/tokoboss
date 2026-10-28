import type {
  InventorySyncEventRecord,
  MappingSyncContextSnapshot,
  MappingSyncState,
} from './inventory-sync-types';

/**
 * Seedable state behind the in-memory inventory sync fakes (UTA-37 / US04,
 * RFC 06 task 26a). Reads: in-memory-inventory-sync-reads.ts (26b); writes:
 * in-memory-inventory-sync-store.ts (26c). Rows carry their workspaceId so
 * cross-workspace reads miss like the Drizzle store.
 */

/** Seeded active mapping + live stock (remove it to archive). */
export type InMemorySyncMapping = Omit<MappingSyncContextSnapshot, 'state'>;

export interface InMemoryInventorySyncState {
  mappings: InMemorySyncMapping[];
  /** mappingId → marketplace_inventory_sync_states row. */
  states: Map<string, MappingSyncState>;
  events: InventorySyncEventRecord[];
  /** providerStockKey(...) → marketplace_listings.provider_stock. */
  providerStock: Map<string, number>;
  now: () => Date;
}

export function createInventorySyncState(
  seed: Partial<InMemoryInventorySyncState> = {}
): InMemoryInventorySyncState {
  return {
    mappings: [],
    states: new Map(),
    events: [],
    providerStock: new Map(),
    now: () => new Date(),
    ...seed,
  };
}

export const providerStockKey = (
  workspaceId: string,
  connectionId: string,
  platformSkuId: string
) => `${workspaceId}:${connectionId}:${platformSkuId}`;

/** Lazy-created row defaults: off, buffer 0, allocation 100, seq 0. */
export function blankSyncState(
  mapping: InMemorySyncMapping,
  now: Date
): MappingSyncState {
  return {
    mappingId: mapping.mappingId,
    workspaceId: mapping.workspaceId,
    variantId: mapping.variantId,
    connectionId: mapping.connectionId,
    syncEnabled: false,
    stockBuffer: 0,
    allocationPct: 100,
    syncStatus: 'off',
    desiredQty: null,
    lastPushedQty: null,
    lastSyncedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    syncSeq: 0,
    lastPushedSeq: 0,
    version: 0,
    createdAt: now,
    updatedAt: now,
  };
}
