import {
  index,
  integer,
  jsonb,
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
 * Raw marketplace webhook intake (UTA-39 / US20, RFC 04 task 5).
 * Deduped by `(provider, dedupe_key)`; kept 30 days, then purged (O9).
 * Migration: infra/drizzle/0021_marketplace_staging.sql.
 * CHECKs on provider, status and payload size stay SQL-only.
 */
export const marketplaceInboundEvents = pgTable(
  'marketplace_inbound_events',
  {
    id: uuidPk(),
    provider: text('provider').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    connectionId: uuid('connection_id').references(
      () => marketplaceConnections.id,
      { onDelete: 'set null' }
    ),
    workspaceId: uuid('workspace_id').references(() => tenants.id, {
      onDelete: 'cascade',
    }),
    eventType: text('event_type').notNull(),
    providerStoreId: text('provider_store_id'),
    payload: jsonb('payload').notNull(),
    status: text('status').notNull().default('received'),
    attempts: integer('attempts').notNull().default(0),
    processedAt: timestamp('processed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    errorCode: text('error_code'),
    createdAt: utcCreatedAt(),
  },
  (t) => [
    uniqueIndex('marketplace_inbound_events_provider_dedupe_unique').on(
      t.provider,
      t.dedupeKey
    ),
    index('marketplace_inbound_events_status_created_idx').on(
      t.status,
      t.createdAt
    ),
  ]
);

export type MarketplaceInboundEventRow =
  typeof marketplaceInboundEvents.$inferSelect;
export type NewMarketplaceInboundEventRow =
  typeof marketplaceInboundEvents.$inferInsert;
