import { pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { catalogWarehouses } from './catalog';
import { marketplaceConnections } from './marketplace-connections';
import { tenants } from './tenants';
import { utcTimestamps, uuidPk } from './helpers';

/**
 * Marketplace store location -> TokoBoss warehouse links
 * (UTA-39 / US20, RFC 04 task 6b).
 * Migration: infra/drizzle/0022_marketplace_links_previews.sql.
 */
export const marketplaceLocationLinks = pgTable(
  'marketplace_location_links',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => marketplaceConnections.id, { onDelete: 'cascade' }),
    externalLocationId: text('external_location_id').notNull(),
    name: text('name'),
    warehouseId: uuid('warehouse_id').references(() => catalogWarehouses.id, {
      onDelete: 'set null',
    }),
    ...utcTimestamps(),
  },
  (t) => [
    uniqueIndex('marketplace_location_links_connection_location_unique').on(
      t.connectionId,
      t.externalLocationId
    ),
  ]
);

export type MarketplaceLocationLinkRow =
  typeof marketplaceLocationLinks.$inferSelect;
export type NewMarketplaceLocationLinkRow =
  typeof marketplaceLocationLinks.$inferInsert;
