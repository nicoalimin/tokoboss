import { eq } from 'drizzle-orm';
import type {
  InboundEventRecord,
  InboundEventStatus,
  InboundEventStore,
} from '@tokoboss/application';
import type { MarketplaceProvider } from '@tokoboss/domain';
import type { DatabaseHandle, Transaction } from '../db';
import {
  marketplaceInboundEvents,
  type MarketplaceInboundEventRow,
} from '../schema/index';

type DbOrTx = Transaction | DatabaseHandle;

const toInboundEventRecord = (
  row: MarketplaceInboundEventRow
): InboundEventRecord => ({
  id: row.id,
  provider: row.provider as MarketplaceProvider,
  dedupeKey: row.dedupeKey,
  eventType: row.eventType,
  providerStoreId: row.providerStoreId,
  connectionId: row.connectionId,
  workspaceId: row.workspaceId,
  payload: row.payload,
  status: row.status as InboundEventStatus,
  attempts: row.attempts,
  processedAt: row.processedAt,
  errorCode: row.errorCode,
});

/**
 * Postgres-backed `InboundEventStore` (UTA-39 / US20, RFC 04 task 71).
 * `insert` is INSERT ... ON CONFLICT DO NOTHING, so a webhook replay on
 * (provider, dedupe_key) or a reused id returns false instead of throwing.
 */
export class DrizzleInboundEventStore implements InboundEventStore {
  constructor(private readonly db: DbOrTx) {}

  withTransaction(tx: DbOrTx): DrizzleInboundEventStore {
    return new DrizzleInboundEventStore(tx);
  }

  async insert(event: InboundEventRecord): Promise<boolean> {
    const rows = await this.db
      .insert(marketplaceInboundEvents)
      .values({ ...event })
      .onConflictDoNothing()
      .returning({ id: marketplaceInboundEvents.id });
    return rows.length > 0;
  }

  async find(id: string): Promise<InboundEventRecord | null> {
    const rows = await this.db
      .select()
      .from(marketplaceInboundEvents)
      .where(eq(marketplaceInboundEvents.id, id))
      .limit(1);
    const row = rows[0];
    return row ? toInboundEventRecord(row) : null;
  }

  async markStatus(
    id: string,
    status: InboundEventStatus,
    patch: Partial<InboundEventRecord>
  ): Promise<void> {
    const { id: _ignored, ...rest } = patch;
    void _ignored;
    await this.db
      .update(marketplaceInboundEvents)
      .set({ ...rest, status })
      .where(eq(marketplaceInboundEvents.id, id));
  }
}
