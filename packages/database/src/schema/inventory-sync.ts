import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { catalogChannelMappings, catalogVariants } from './catalog';
import { marketplaceConnections } from './marketplace-connections';
import { tenants } from './tenants';
import { utcTimestamps } from './helpers';

export type InventorySyncChannel = 'shopee' | 'tiktok_shop' | 'blibli';
export type InventorySyncStatusValue =
  'off' | 'syncing' | 'synced' | 'needs_attention';
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

const workspaceRef = () =>
  uuid('workspace_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const variantRef = () =>
  uuid('variant_id')
    .notNull()
    .references(() => catalogVariants.id, { onDelete: 'cascade' });
const connectionRef = () =>
  uuid('connection_id').references(() => marketplaceConnections.id, {
    onDelete: 'set null',
  });

/**
 * Outbound inventory sync (UTA-37 / US04, RFC 06 task 16). One state row
 * per SKU mapping (1:1 with `catalog_channel_mappings.id`); the append-only
 * event log is in ./inventory-sync-events. CHECKs live in the SQL.
 * Migration: infra/drizzle/0024_inventory_sync.sql.
 */
export const marketplaceInventorySyncStates = pgTable(
  'marketplace_inventory_sync_states',
  {
    mappingId: uuid('mapping_id')
      .primaryKey()
      .references(() => catalogChannelMappings.id, { onDelete: 'cascade' }),
    workspaceId: workspaceRef(),
    variantId: variantRef(),
    connectionId: connectionRef(),
    syncEnabled: boolean('sync_enabled').notNull().default(false),
    stockBuffer: integer('stock_buffer').notNull().default(0),
    allocationPct: integer('allocation_pct').notNull().default(100),
    syncStatus: text('sync_status')
      .$type<InventorySyncStatusValue>()
      .notNull()
      .default('off'),
    desiredQty: integer('desired_qty'),
    lastPushedQty: integer('last_pushed_qty'),
    lastSyncedAt: timestamp('last_synced_at', {
      withTimezone: true,
      mode: 'date',
    }),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    syncSeq: integer('sync_seq').notNull().default(0),
    lastPushedSeq: integer('last_pushed_seq').notNull().default(0),
    version: integer('version').notNull().default(1),
    ...utcTimestamps(),
  },
  (t) => [
    index('marketplace_sync_states_workspace_status_idx').on(
      t.workspaceId,
      t.syncStatus
    ),
    index('marketplace_sync_states_workspace_variant_idx').on(
      t.workspaceId,
      t.variantId
    ),
    index('marketplace_sync_states_connection_idx').on(t.connectionId),
  ]
);

export type MarketplaceInventorySyncStateRow =
  typeof marketplaceInventorySyncStates.$inferSelect;
export type NewMarketplaceInventorySyncStateRow =
  typeof marketplaceInventorySyncStates.$inferInsert;
