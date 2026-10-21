import { and, eq, isNotNull, lt, type SQL } from 'drizzle-orm';
import type { ConnectionRecord } from '@tokoboss/application';
import type { MarketplaceProvider } from '@tokoboss/domain';
import type { DatabaseHandle, Transaction } from '../db';
import { marketplaceConnections } from '../schema/index';
import { toConnectionRecord } from './drizzle-marketplace-connection-mappers';

/**
 * Read helpers for `marketplace_connections` (UTA-39 / US20, RFC 04
 * task 67c). Used by `DrizzleConnectionStore` (67d). Soft-removed rows
 * are still returned; use cases filter them.
 */

type DbOrTx = Transaction | DatabaseHandle;

async function selectConnections(
  db: DbOrTx,
  where: SQL | undefined,
  limit?: number
): Promise<ConnectionRecord[]> {
  const query = db.select().from(marketplaceConnections).where(where);
  const rows = limit === undefined ? await query : await query.limit(limit);
  return rows.map(toConnectionRecord);
}

export async function findConnection(
  db: DbOrTx,
  workspaceId: string,
  id: string
): Promise<ConnectionRecord | null> {
  const where = and(
    eq(marketplaceConnections.id, id),
    eq(marketplaceConnections.workspaceId, workspaceId)
  );
  return (await selectConnections(db, where, 1))[0] ?? null;
}

export async function findConnectionByStore(
  db: DbOrTx,
  input: {
    workspaceId: string;
    provider: MarketplaceProvider;
    providerStoreId: string;
  }
): Promise<ConnectionRecord | null> {
  const where = and(
    eq(marketplaceConnections.workspaceId, input.workspaceId),
    eq(marketplaceConnections.provider, input.provider),
    eq(marketplaceConnections.providerStoreId, input.providerStoreId)
  );
  return (await selectConnections(db, where, 1))[0] ?? null;
}

export function listConnections(
  db: DbOrTx,
  workspaceId: string
): Promise<ConnectionRecord[]> {
  return selectConnections(
    db,
    eq(marketplaceConnections.workspaceId, workspaceId)
  );
}

/** Connected rows whose auth expires before `before` (expiry sweep). */
export function listExpiringConnections(
  db: DbOrTx,
  before: Date
): Promise<ConnectionRecord[]> {
  return selectConnections(
    db,
    and(
      eq(marketplaceConnections.status, 'connected'),
      isNotNull(marketplaceConnections.authExpiresAt),
      lt(marketplaceConnections.authExpiresAt, before)
    )
  );
}
