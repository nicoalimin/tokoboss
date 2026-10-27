import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { catalogChannelMappings, catalogVariants } from './catalog';
import { marketplaceConnections } from './marketplace-connections';
import { tenants } from './tenants';
import { utcCreatedAt, uuidPk } from './helpers';

export type SkuMappingEventChannel = 'shopee' | 'tiktok_shop' | 'blibli';
export type SkuMappingEventAction =
  'mapped' | 'remapped' | 'unmapped' | 'bulk_mapped' | 'restored';
export type SkuMappingEventSource =
  'manual' | 'suggested_single' | 'suggested_bulk';

/**
 * Append-only SKU mapping history (UTA-40 / US03, RFC 05 task 3).
 * One row per map / remap / unmap / bulk map / restore of a Store SKU.
 * CHECK constraints on channel / action / source live in the SQL.
 * Migration: infra/drizzle/0023_sku_mapping_history.sql.
 */
export const catalogChannelMappingEvents = pgTable(
  'catalog_channel_mapping_events',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    mappingId: uuid('mapping_id').references(() => catalogChannelMappings.id, {
      onDelete: 'set null',
    }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => catalogVariants.id, { onDelete: 'cascade' }),
    previousVariantId: uuid('previous_variant_id').references(
      () => catalogVariants.id,
      { onDelete: 'set null' }
    ),
    connectionId: uuid('connection_id').references(
      () => marketplaceConnections.id,
      { onDelete: 'set null' }
    ),
    channel: text('channel').$type<SkuMappingEventChannel>().notNull(),
    shopExtId: text('shop_ext_id').notNull(),
    externalItemId: text('external_item_id'),
    platformSkuId: text('platform_sku_id').notNull(),
    storeSkuText: text('store_sku_text'),
    listingTitle: text('listing_title'),
    variantName: text('variant_name'),
    action: text('action').$type<SkuMappingEventAction>().notNull(),
    source: text('source').$type<SkuMappingEventSource>().notNull(),
    actorId: text('actor_id').notNull(),
    correlationId: text('correlation_id'),
    createdAt: utcCreatedAt(),
  },
  (t) => [
    index('catalog_mapping_events_workspace_created_idx').on(
      t.workspaceId,
      t.createdAt.desc()
    ),
    index('catalog_mapping_events_workspace_variant_created_idx').on(
      t.workspaceId,
      t.variantId,
      t.createdAt.desc()
    ),
  ]
);

export type CatalogChannelMappingEventRow =
  typeof catalogChannelMappingEvents.$inferSelect;
export type NewCatalogChannelMappingEventRow =
  typeof catalogChannelMappingEvents.$inferInsert;
