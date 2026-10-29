import { sql } from 'drizzle-orm';
import type { UpsertConnectionInput } from '@tokoboss/application';
import {
  marketplaceConnections,
  type NewMarketplaceConnectionRow,
} from '../schema/index';

/**
 * Upsert values for `marketplace_connections` (UTA-39 / US20, RFC 04
 * task 67b). The Drizzle connections repository (67c) runs
 * `insert().values(toConnectionInsert(i)).onConflictDoUpdate({ target:
 * CONNECTION_UPSERT_TARGET, set: toConnectionConflictSet(i) })`.
 */

export const CONNECTION_UPSERT_TARGET = [
  marketplaceConnections.workspaceId,
  marketplaceConnections.provider,
  marketplaceConnections.providerStoreId,
];

/** Store + auth columns written on both first connect and reconnect. */
function refreshedValues(input: UpsertConnectionInput) {
  return {
    connectMode: input.connectMode,
    providerAccountId: input.shop.providerAccountId,
    shopCipher: input.shop.shopCipher,
    storeName: input.shop.storeName,
    region: input.shop.region,
    status: 'connected',
    grantedScopes: input.grantedScopes,
    accessTokenExpiresAt: input.accessTokenExpiresAt,
    authExpiresAt: input.authExpiresAt,
    connectedBy: input.connectedBy,
    connectedAt: input.connectedAt,
  };
}

/**
 * First connect starts with order import and stock sync on (CoS 2026-10-30,
 * RFC 07 row 43a); a reconnect keeps the stored flags via the conflict set.
 */
export function toConnectionInsert(
  input: UpsertConnectionInput
): NewMarketplaceConnectionRow {
  return {
    workspaceId: input.workspaceId,
    provider: input.provider,
    providerStoreId: input.shop.providerStoreId,
    orderImportEnabled: true,
    inventorySyncEnabled: true,
    ...refreshedValues(input),
  };
}

/** Reconnect clears any disconnect / soft remove and bumps the version. */
export function toConnectionConflictSet(input: UpsertConnectionInput) {
  return {
    ...refreshedValues(input),
    disconnectSource: null,
    disconnectedAt: null,
    disconnectedBy: null,
    removedAt: null,
    version: sql`${marketplaceConnections.version} + 1`,
    updatedAt: new Date(),
  };
}
