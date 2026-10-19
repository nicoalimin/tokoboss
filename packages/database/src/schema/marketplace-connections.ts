import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { jobs } from './jobs';
import { tenants } from './tenants';
import { utcTimestamps, uuidPk } from './helpers';

const tz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'date' });

/**
 * Marketplace store connections (UTA-39 / US20, RFC 04 task 2).
 * Migration: infra/drizzle/0020_marketplace_connections.sql.
 * Secrets never live here; see `marketplaceCredentials`.
 */
export const marketplaceConnections = pgTable(
  'marketplace_connections',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    connectMode: text('connect_mode').notNull(),
    providerStoreId: text('provider_store_id').notNull(),
    providerAccountId: text('provider_account_id'),
    shopCipher: text('shop_cipher'),
    storeName: text('store_name'),
    region: text('region'),
    status: text('status').notNull().default('connected'),
    disconnectSource: text('disconnect_source'),
    disconnectedAt: tz('disconnected_at'),
    disconnectedBy: text('disconnected_by'),
    removedAt: tz('removed_at'),
    capabilities: jsonb('capabilities').notNull().default({}),
    grantedScopes: text('granted_scopes').array().notNull().default([]),
    missingPermissions: text('missing_permissions')
      .array()
      .notNull()
      .default([]),
    accessTokenExpiresAt: tz('access_token_expires_at'),
    authExpiresAt: tz('auth_expires_at'),
    lastRefreshedAt: tz('last_refreshed_at'),
    lastCheckedAt: tz('last_checked_at'),
    lastErrorCode: text('last_error_code'),
    orderImportEnabled: boolean('order_import_enabled')
      .notNull()
      .default(false),
    inventorySyncEnabled: boolean('inventory_sync_enabled')
      .notNull()
      .default(false),
    initialImportStatus: text('initial_import_status'),
    initialImportCursor: jsonb('initial_import_cursor'),
    importJobId: uuid('import_job_id').references(() => jobs.id, {
      onDelete: 'set null',
    }),
    connectedBy: text('connected_by'),
    connectedAt: tz('connected_at'),
    version: integer('version').notNull().default(1),
    ...utcTimestamps(),
  },
  (t) => [
    uniqueIndex('marketplace_connections_workspace_provider_store_unique').on(
      t.workspaceId,
      t.provider,
      t.providerStoreId
    ),
    index('marketplace_connections_status_expiry_idx').on(
      t.status,
      t.accessTokenExpiresAt
    ),
  ]
);

/** Sealed (AES-GCM) credential blob, one row per connection. */
export const marketplaceCredentials = pgTable('marketplace_credentials', {
  connectionId: uuid('connection_id')
    .primaryKey()
    .references(() => marketplaceConnections.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  keyId: text('key_id').notNull(),
  nonce: text('nonce').notNull(),
  ciphertext: text('ciphertext').notNull(),
  authTag: text('auth_tag').notNull(),
  version: integer('version').notNull().default(1),
  ...utcTimestamps(),
});

export type MarketplaceConnectionRow =
  typeof marketplaceConnections.$inferSelect;
export type NewMarketplaceConnectionRow =
  typeof marketplaceConnections.$inferInsert;
export type MarketplaceCredentialRow =
  typeof marketplaceCredentials.$inferSelect;
