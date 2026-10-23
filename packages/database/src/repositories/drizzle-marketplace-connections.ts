import { and, eq, sql } from 'drizzle-orm';
import type {
  ConnectionPatch,
  ConnectionRecord,
  ConnectionStore,
  UpsertConnectionInput,
} from '@tokoboss/application';
import type { MarketplaceProvider } from '@tokoboss/domain';
import type { DatabaseHandle, Transaction } from '../db';
import { marketplaceConnections } from '../schema/index';
import { toConnectionRecord } from './drizzle-marketplace-connection-mappers';
import {
  findConnection,
  findConnectionByStore,
  listConnections,
  listExpiringConnections,
  listRefreshDueConnections,
} from './drizzle-marketplace-connection-reads';
import {
  CONNECTION_UPSERT_TARGET,
  toConnectionConflictSet,
  toConnectionInsert,
} from './drizzle-marketplace-connection-upsert';

type DbOrTx = Transaction | DatabaseHandle;

/**
 * Postgres-backed `ConnectionStore` (UTA-39 / US20, RFC 04 task 67d).
 * Reads delegate to 67c helpers; soft-removed rows are still returned.
 * `update` throws on a stale version, like `InMemoryConnectionStore`.
 */
export class DrizzleConnectionStore implements ConnectionStore {
  constructor(private readonly db: DbOrTx) {}

  withTransaction(tx: DbOrTx): DrizzleConnectionStore {
    return new DrizzleConnectionStore(tx);
  }

  find(workspaceId: string, id: string): Promise<ConnectionRecord | null> {
    return findConnection(this.db, workspaceId, id);
  }

  findByStore(input: {
    workspaceId: string;
    provider: MarketplaceProvider;
    providerStoreId: string;
  }): Promise<ConnectionRecord | null> {
    return findConnectionByStore(this.db, input);
  }

  list(workspaceId: string): Promise<ConnectionRecord[]> {
    return listConnections(this.db, workspaceId);
  }

  listExpiring(before: Date): Promise<ConnectionRecord[]> {
    return listExpiringConnections(this.db, before);
  }

  listRefreshDue(before: Date): Promise<ConnectionRecord[]> {
    return listRefreshDueConnections(this.db, before);
  }

  async upsert(input: UpsertConnectionInput): Promise<ConnectionRecord> {
    const rows = await this.db
      .insert(marketplaceConnections)
      .values(toConnectionInsert(input))
      .onConflictDoUpdate({
        target: CONNECTION_UPSERT_TARGET,
        set: toConnectionConflictSet(input),
      })
      .returning();
    return toConnectionRecord(rows[0]!);
  }

  async update(input: {
    workspaceId: string;
    connectionId: string;
    expectedVersion: number;
    patch: ConnectionPatch;
  }): Promise<ConnectionRecord> {
    const rows = await this.db
      .update(marketplaceConnections)
      .set({
        ...input.patch,
        version: sql`${marketplaceConnections.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(marketplaceConnections.id, input.connectionId),
          eq(marketplaceConnections.workspaceId, input.workspaceId),
          eq(marketplaceConnections.version, input.expectedVersion)
        )
      )
      .returning();
    const row = rows[0];
    if (!row) {
      throw new Error(`stale connection version: ${input.connectionId}`);
    }
    return toConnectionRecord(row);
  }
}
