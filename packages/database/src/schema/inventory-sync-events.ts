import { index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { catalogChannelMappings, catalogVariants } from './catalog';
import type {
  InventorySyncChannel,
  InventorySyncOutcome,
  InventorySyncTrigger,
} from './inventory-sync';
import { marketplaceConnections } from './marketplace-connections';
import { tenants } from './tenants';
import { utcCreatedAt, uuidPk } from './helpers';

/**
 * Append-only outbound inventory sync log (UTA-37 / US04, RFC 06 task 16b).
 * One row per push attempt per SKU mapping. CHECK constraints on channel /
 * trigger / outcome live in the SQL. Migration: 0024_inventory_sync.sql.
 */
export const marketplaceInventorySyncEvents = pgTable(
  'marketplace_inventory_sync_events',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    mappingId: uuid('mapping_id')
      .notNull()
      .references(() => catalogChannelMappings.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => catalogVariants.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id').references(
      () => marketplaceConnections.id,
      { onDelete: 'set null' }
    ),
    channel: text('channel').$type<InventorySyncChannel>().notNull(),
    shopExtId: text('shop_ext_id').notNull(),
    platformSkuId: text('platform_sku_id').notNull(),
    syncSeq: integer('sync_seq').notNull(),
    trigger: text('trigger').$type<InventorySyncTrigger>().notNull(),
    outcome: text('outcome').$type<InventorySyncOutcome>().notNull(),
    desiredQty: integer('desired_qty').notNull(),
    pushedQty: integer('pushed_qty'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    actorId: text('actor_id'),
    correlationId: text('correlation_id'),
    createdAt: utcCreatedAt(),
  },
  (t) => [
    index('marketplace_sync_events_workspace_created_idx').on(
      t.workspaceId,
      t.createdAt.desc()
    ),
    index('marketplace_sync_events_mapping_created_idx').on(
      t.mappingId,
      t.createdAt.desc()
    ),
  ]
);

export type MarketplaceInventorySyncEventRow =
  typeof marketplaceInventorySyncEvents.$inferSelect;
export type NewMarketplaceInventorySyncEventRow =
  typeof marketplaceInventorySyncEvents.$inferInsert;
