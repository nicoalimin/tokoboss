import { and, eq } from 'drizzle-orm';
import {
  isStoreClaimConflict,
  storeConnectedElsewhere,
  type StoreClaimRecord,
  type StoreClaimStore,
} from '@tokoboss/application';
import type { MarketplaceProvider } from '@tokoboss/domain';
import type { DatabaseHandle, Transaction } from '../db';
import {
  marketplaceStoreClaims,
  type MarketplaceStoreClaimRow,
} from '../schema/index';

type DbOrTx = Transaction | DatabaseHandle;
type StoreKey = { provider: MarketplaceProvider; providerStoreId: string };

const toStoreClaimRecord = (
  row: MarketplaceStoreClaimRow
): StoreClaimRecord => ({
  provider: row.provider as MarketplaceProvider,
  providerStoreId: row.providerStoreId,
  workspaceId: row.workspaceId,
  connectionId: row.connectionId,
  claimedBy: row.claimedBy,
  claimedAt: row.claimedAt,
});

const byStore = (key: StoreKey) =>
  and(
    eq(marketplaceStoreClaims.provider, key.provider),
    eq(marketplaceStoreClaims.providerStoreId, key.providerStoreId)
  );

/**
 * Postgres-backed `StoreClaimStore` (UTA-39 / US20, RFC 04 task 70).
 * One global owner per provider store. `acquire` is INSERT ... ON
 * CONFLICT DO NOTHING RETURNING; a loser gets the owner row back, and a
 * 23505 on the claims constraint maps to STORE_CONNECTED_ELSEWHERE.
 */
export class DrizzleStoreClaimStore implements StoreClaimStore {
  constructor(private readonly db: DbOrTx) {}

  withTransaction(tx: DbOrTx): DrizzleStoreClaimStore {
    return new DrizzleStoreClaimStore(tx);
  }

  async find(key: StoreKey): Promise<StoreClaimRecord | null> {
    const rows = await this.db
      .select()
      .from(marketplaceStoreClaims)
      .where(byStore(key))
      .limit(1);
    const row = rows[0];
    return row ? toStoreClaimRecord(row) : null;
  }

  async acquire(claim: StoreClaimRecord): Promise<StoreClaimRecord> {
    let inserted: MarketplaceStoreClaimRow[];
    try {
      inserted = await this.db
        .insert(marketplaceStoreClaims)
        .values({ ...claim })
        .onConflictDoNothing({
          target: [
            marketplaceStoreClaims.provider,
            marketplaceStoreClaims.providerStoreId,
          ],
        })
        .returning();
    } catch (err) {
      if (isStoreClaimConflict(err)) throw storeConnectedElsewhere();
      throw err;
    }
    if (inserted[0]) return toStoreClaimRecord(inserted[0]);
    const owner = await this.find(claim);
    if (!owner) throw storeConnectedElsewhere();
    return owner;
  }

  async release(key: StoreKey & { workspaceId: string }): Promise<boolean> {
    const rows = await this.db
      .delete(marketplaceStoreClaims)
      .where(
        and(
          byStore(key),
          eq(marketplaceStoreClaims.workspaceId, key.workspaceId)
        )
      )
      .returning({ id: marketplaceStoreClaims.id });
    return rows.length > 0;
  }
}
