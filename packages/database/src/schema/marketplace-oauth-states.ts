import {
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
 * One-time OAuth `state` records for marketplace connect/reconnect
 * (UTA-39 / US20, RFC 04 task 3).
 * Migration: infra/drizzle/0020_marketplace_connections.sql.
 * Only the SHA-256 hash of the state is stored, never the raw value.
 */
export const marketplaceOauthStates = pgTable(
  'marketplace_oauth_states',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    userId: text('user_id').notNull(),
    stateHash: text('state_hash').notNull(),
    connectionId: uuid('connection_id').references(
      () => marketplaceConnections.id,
      { onDelete: 'cascade' }
    ),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true, mode: 'date' }),
    createdAt: utcCreatedAt(),
  },
  (t) => [
    uniqueIndex('marketplace_oauth_states_state_hash_unique').on(t.stateHash),
  ]
);

export type MarketplaceOauthStateRow =
  typeof marketplaceOauthStates.$inferSelect;
export type NewMarketplaceOauthStateRow =
  typeof marketplaceOauthStates.$inferInsert;
