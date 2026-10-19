import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { marketplaceConnections } from './marketplace-connections';
import { tenants } from './tenants';
import { utcCreatedAt, uuidPk } from './helpers';

/**
 * PII-free recent-order previews from a connected store
 * (UTA-39 / US20, RFC 04 task 7). No buyer name, address or phone.
 * Capped at 50 orders from the last 7 days by the importer.
 * Migration: infra/drizzle/0022_marketplace_links_previews.sql.
 */
export const marketplaceOrderPreviews = pgTable(
  'marketplace_order_previews',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => marketplaceConnections.id, { onDelete: 'cascade' }),
    externalOrderId: text('external_order_id').notNull(),
    providerStatus: text('provider_status'),
    orderedAt: timestamp('ordered_at', { withTimezone: true, mode: 'date' }),
    lineCount: integer('line_count').notNull().default(0),
    totalCents: integer('total_cents'),
    createdAt: utcCreatedAt(),
  },
  (t) => [
    uniqueIndex('marketplace_order_previews_connection_order_unique').on(
      t.connectionId,
      t.externalOrderId
    ),
  ]
);

export type MarketplaceOrderPreviewRow =
  typeof marketplaceOrderPreviews.$inferSelect;
export type NewMarketplaceOrderPreviewRow =
  typeof marketplaceOrderPreviews.$inferInsert;
