import { and, eq, gt, isNull } from 'drizzle-orm';
import type { OAuthStateRecord, OAuthStateStore } from '@tokoboss/application';
import type { MarketplaceProvider } from '@tokoboss/domain';
import type { DatabaseHandle, Transaction } from '../db';
import {
  marketplaceOauthStates,
  type MarketplaceOauthStateRow,
} from '../schema/index';

type DbOrTx = Transaction | DatabaseHandle;

const toOAuthStateRecord = (
  row: MarketplaceOauthStateRow
): OAuthStateRecord => ({
  id: row.id,
  workspaceId: row.workspaceId,
  provider: row.provider as MarketplaceProvider,
  userId: row.userId,
  connectionId: row.connectionId,
  expiresAt: row.expiresAt,
  consumedAt: row.consumedAt,
});

/**
 * Postgres-backed `OAuthStateStore` (UTA-39 / US20, RFC 04 task 69).
 * Stores only the SHA-256 state hash. `consume` is one atomic UPDATE,
 * so a state works once and never after `expiresAt`.
 */
export class DrizzleOAuthStateStore implements OAuthStateStore {
  constructor(private readonly db: DbOrTx) {}

  withTransaction(tx: DbOrTx): DrizzleOAuthStateStore {
    return new DrizzleOAuthStateStore(tx);
  }

  async create(record: OAuthStateRecord, stateHash: string): Promise<void> {
    await this.db.insert(marketplaceOauthStates).values({
      id: record.id,
      workspaceId: record.workspaceId,
      provider: record.provider,
      userId: record.userId,
      stateHash,
      connectionId: record.connectionId,
      expiresAt: record.expiresAt,
      consumedAt: record.consumedAt,
    });
  }

  async consume(
    stateHash: string,
    now: Date
  ): Promise<OAuthStateRecord | null> {
    const rows = await this.db
      .update(marketplaceOauthStates)
      .set({ consumedAt: now })
      .where(
        and(
          eq(marketplaceOauthStates.stateHash, stateHash),
          isNull(marketplaceOauthStates.consumedAt),
          gt(marketplaceOauthStates.expiresAt, now)
        )
      )
      .returning();
    const row = rows[0];
    return row ? toOAuthStateRecord(row) : null;
  }
}
