import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { marketplaceConnections } from './marketplace-connections';
import { tenants } from './tenants';
import { utcTimestamps, uuidPk } from './helpers';

/**
 * Staged marketplace listings for the listing -> SKU mapping flow
 * (UTA-39 / US20, RFC 04 task 6a).
 * Migration: infra/drizzle/0021_marketplace_staging.sql.
 * The mapping_state CHECK stays SQL-only.
 */
export const marketplaceListings = pgTable(
  'marketplace_listings',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => marketplaceConnections.id, { onDelete: 'cascade' }),
    externalItemId: text('external_item_id').notNull(),
    platformSkuId: text('platform_sku_id').notNull(),
    storeSkuText: text('store_sku_text'),
    barcodeHint: text('barcode_hint'),
    title: text('title'),
    variantName: text('variant_name'),
    listingStatus: text('listing_status'),
    providerStock: integer('provider_stock'),
    mappingState: text('mapping_state').notNull().default('unmapped'),
    suggestedVariantIds: uuid('suggested_variant_ids')
      .array()
      .notNull()
      .default([]),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    ...utcTimestamps(),
  },
  (t) => [
    uniqueIndex('marketplace_listings_connection_platform_sku_unique').on(
      t.connectionId,
      t.platformSkuId
    ),
    index('marketplace_listings_connection_mapping_state_idx').on(
      t.connectionId,
      t.mappingState
    ),
  ]
);

export type MarketplaceListingRow = typeof marketplaceListings.$inferSelect;
export type NewMarketplaceListingRow = typeof marketplaceListings.$inferInsert;
