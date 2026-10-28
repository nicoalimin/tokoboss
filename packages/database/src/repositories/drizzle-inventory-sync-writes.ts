import { and, eq } from 'drizzle-orm';
import type {
  InventorySyncEventRecord,
  InventorySyncScope,
  InventorySyncWriteStore,
} from '@tokoboss/application';
import {
  marketplaceInventorySyncEvents as e,
  marketplaceListings as l,
} from '../schema/index';
import {
  commitInventorySyncAttempt,
  markInventorySyncing,
} from './drizzle-inventory-sync-attempts';
import type { DbOrTx } from './drizzle-inventory-sync-scope';
import {
  resetInventorySyncState,
  upsertInventorySyncSettings,
} from './drizzle-inventory-sync-settings';

type In<K extends keyof InventorySyncWriteStore> = Parameters<
  InventorySyncWriteStore[K]
>[0];

/**
 * Postgres-backed InventorySyncWriteStore (UTA-37 / US04, RFC 06 task 30c).
 * Settings + reset live in 30a, markSyncing + the sync_seq CAS in 30b; this
 * class adds the append-only event log and listing provider_stock. Reads
 * are 29c; the facade is row 31. Every write is workspace-scoped.
 */
export class DrizzleInventorySyncWrites implements InventorySyncWriteStore {
  constructor(private readonly db: DbOrTx) {}

  withTransaction(tx: DbOrTx): DrizzleInventorySyncWrites {
    return new DrizzleInventorySyncWrites(tx);
  }

  upsertSettings(input: In<'upsertSettings'>) {
    return upsertInventorySyncSettings(this.db, input);
  }

  markSyncing(scope: InventorySyncScope) {
    return markInventorySyncing(this.db, scope);
  }

  commitAttempt(input: In<'commitAttempt'>) {
    return commitInventorySyncAttempt(this.db, input);
  }

  /** Archived / re-pointed mapping → sync state off (RFC 06 §2). */
  resetMappingSync(workspaceId: string, mappingId: string) {
    return resetInventorySyncState(this.db, workspaceId, mappingId);
  }

  async appendEvent(input: In<'appendEvent'>) {
    const [row] = await this.db.insert(e).values(input).returning();
    if (!row) throw new Error('Inventory sync event not recorded');
    return row as InventorySyncEventRecord;
  }

  /** marketplace_listings.provider_stock after a successful push. */
  async setListingProviderStock(input: In<'setListingProviderStock'>) {
    const { workspaceId, connectionId, platformSkuId, providerStock } = input;
    await this.db
      .update(l)
      .set({ providerStock, updatedAt: new Date() })
      .where(
        and(
          eq(l.workspaceId, workspaceId),
          eq(l.connectionId, connectionId),
          eq(l.platformSkuId, platformSkuId)
        )
      );
  }
}
