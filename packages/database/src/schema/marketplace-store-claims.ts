import { pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { marketplaceConnections } from './marketplace-connections';
import { tenants } from './tenants';
import { utcCreatedAt, uuidPk } from './helpers';

/**
 * Global store-ownership claims (UTA-39 / US20, RFC 04 task 4).
 * One provider store belongs to exactly one workspace: the unique
 * `(provider, provider_store_id)` has no workspace column on purpose.
 * Migration: infra/drizzle/0020_marketplace_connections.sql.
 */
export const marketplaceStoreClaims = pgTable(
  'marketplace_store_claims',
  {
    id: uuidPk(),
    provider: text('provider').notNull(),
    providerStoreId: text('provider_store_id').notNull(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => marketplaceConnections.id, { onDelete: 'cascade' }),
    claimedBy: text('claimed_by').notNull(),
    claimedAt: utcCreatedAt('claimed_at'),
  },
  (t) => [
    uniqueIndex('marketplace_store_claims_provider_store_unique').on(
      t.provider,
      t.providerStoreId
    ),
  ]
);

export type MarketplaceStoreClaimRow =
  typeof marketplaceStoreClaims.$inferSelect;
export type NewMarketplaceStoreClaimRow =
  typeof marketplaceStoreClaims.$inferInsert;
