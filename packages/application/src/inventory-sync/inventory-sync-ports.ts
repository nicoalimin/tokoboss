import type {
  MarketplaceConnector,
  MarketplaceProvider,
} from '@tokoboss/domain';
import type { RefreshConnectionTokensDeps } from '../integrations/refresh-connection-tokens';
import type { TenancyAuditSink } from '../tenancy/tenancy-ports';
import type {
  InventorySyncAttentionBannerItem,
  InventorySyncEventRecord,
  MappingSyncContextSnapshot,
  MappingSyncState,
} from './inventory-sync-types';

/**
 * Ports for Story 04 inventory sync (UTA-37 / US04, RFC 06 task 21). Every
 * method is workspace-scoped and ignores archived mappings; misses return
 * null. Stock is always read fresh from Postgres, never from a job payload.
 */

/** Active mappings a sync run or overview covers (at least one filter). */
export interface InventorySyncScope {
  workspaceId: string;
  mappingId?: string;
  variantIds?: readonly string[];
  connectionId?: string;
}

export interface InventorySyncReadStore {
  /** Mapping + connection + state + live stock levels and location links. */
  loadMappingContext(
    workspaceId: string,
    mappingId: string
  ): Promise<MappingSyncContextSnapshot | null>;
  /** Ids of active sync_enabled mappings in scope (fan-out targets). */
  listSyncEnabledMappingIds(scope: InventorySyncScope): Promise<string[]>;
  /** Existing state rows in scope; absent rows mean defaults. */
  listStates(scope: InventorySyncScope): Promise<MappingSyncState[]>;
  /** needs_attention alerts in scope, newest first. */
  listAttention(
    scope: InventorySyncScope
  ): Promise<InventorySyncAttentionBannerItem[]>;
}

export interface InventorySyncWriteStore {
  /** Lazy-creates the row; enabled → syncing + syncSeq + 1, else off. */
  upsertSettings(input: {
    workspaceId: string;
    mappingId: string;
    syncEnabled: boolean;
    stockBuffer: number;
    allocationPct: number;
  }): Promise<MappingSyncState>;
  /** syncSeq + 1 and syncing for sync_enabled mappings in scope. */
  markSyncing(scope: InventorySyncScope): Promise<MappingSyncState[]>;
  /** CAS on syncSeq = attemptSeq; null = newer seq won (skipped_stale). */
  commitAttempt(input: {
    workspaceId: string;
    mappingId: string;
    attemptSeq: number;
    outcome: 'synced' | 'needs_attention';
    desiredQty: number;
    pushedQty: number | null;
    errorCode: string | null;
    errorMessage: string | null;
    at: Date;
  }): Promise<MappingSyncState | null>;
  appendEvent(
    input: Omit<InventorySyncEventRecord, 'id' | 'createdAt'>
  ): Promise<InventorySyncEventRecord>;
  /** marketplace_listings.provider_stock after a successful push. */
  setListingProviderStock(input: {
    workspaceId: string;
    connectionId: string;
    platformSkuId: string;
    providerStock: number;
  }): Promise<void>;
}

/** Use-case deps; audit actions inventory_sync.*, category 'workspace'. */
export interface InventorySyncDeps {
  reads: InventorySyncReadStore;
  writes: InventorySyncWriteStore;
  connectors: {
    connectorFor(provider: MarketplaceProvider): MarketplaceConnector;
  };
  /** Passed to ensureFreshAccessToken before every push (no crons). */
  tokenDeps: RefreshConnectionTokensDeps;
  audit: Pick<TenancyAuditSink, 'append'>;
  now(): Date;
  /** Backoff before the 1 bounded retry (150 ms runtime, 0 in tests). */
  retryBackoffMs?: number;
}
