import type {
  InventorySyncStatus,
  MarketplaceConnectionStatus,
  MarketplaceProvider,
  StoreLocationLinkSnapshot,
  WarehouseInventorySnapshot,
} from '@tokoboss/domain';

/**
 * Story 04 inventory sync records (UTA-37 / US04, RFC 06 task 20). SKU TokoBoss
 * is the only stock key. No state row = off, buffer 0, allocation 100, seq 0.
 */
export type InventorySyncTrigger =
  | 'stock_adjustment'
  | 'transfer_send'
  | 'transfer_receive'
  | 'transfer_cancel'
  | 'stock_count_post'
  | 'config_change'
  | 'manual_retry'
  | 'location_link';

export type InventorySyncOutcome =
  'synced' | 'needs_attention' | 'skipped_stale';
export type InventorySyncRemediationCode =
  'reauth_store' | 'link_warehouse' | 'check_listing' | 'retry_now';

/** One marketplace_inventory_sync_states row (1:1 with a mapping). */
export interface MappingSyncState {
  mappingId: string;
  workspaceId: string;
  variantId: string;
  connectionId: string | null;
  syncEnabled: boolean;
  stockBuffer: number;
  allocationPct: number;
  syncStatus: InventorySyncStatus;
  desiredQty: number | null;
  lastPushedQty: number | null;
  lastSyncedAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  syncSeq: number;
  lastPushedSeq: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** One append-only marketplace_inventory_sync_events row. */
export interface InventorySyncEventRecord {
  id: string;
  workspaceId: string;
  mappingId: string;
  variantId: string;
  connectionId: string | null;
  channel: MarketplaceProvider;
  shopExtId: string;
  platformSkuId: string;
  syncSeq: number;
  trigger: InventorySyncTrigger;
  outcome: InventorySyncOutcome;
  desiredQty: number;
  pushedQty: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  actorId: string | null;
  correlationId: string | null;
  createdAt: Date;
}

export interface InventorySyncMappingRef {
  mappingId: string;
  variantId: string;
  skuCode: string;
  storeSkuText: string | null;
  platformSkuId: string;
  channel: MarketplaceProvider;
  storeDisplayName: string | null;
}

/** Fresh read for one push: active mapping + connection + stock snapshot. */
export interface MappingSyncContextSnapshot extends InventorySyncMappingRef {
  workspaceId: string;
  connectionId: string | null;
  connectionStatus: MarketplaceConnectionStatus | null;
  shopExtId: string;
  externalItemId: string | null;
  state: MappingSyncState | null;
  warehouses: readonly WarehouseInventorySnapshot[];
  locationLinks: readonly StoreLocationLinkSnapshot[];
}

/** One calm Perlu tindakan alert: SKU, Store SKU, store, reason, action. */
export interface InventorySyncAttentionBannerItem extends InventorySyncMappingRef {
  errorCode: string;
  reason: string;
  remediation: InventorySyncRemediationCode;
  updatedAt: Date;
}
