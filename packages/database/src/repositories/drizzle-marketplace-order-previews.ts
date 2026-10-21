import { and, eq, sql } from 'drizzle-orm';
import type {
  OrderPreviewStore,
  OrderPreviewView,
} from '@tokoboss/application';
import type { MarketplaceOrderPreviewRow } from '@tokoboss/domain';
import type { DatabaseHandle, Transaction } from '../db';
import {
  marketplaceOrderPreviews,
  type MarketplaceOrderPreviewRow as PreviewDbRow,
} from '../schema/index';

type DbOrTx = Transaction | DatabaseHandle;
type ConnectionRef = { workspaceId: string; connectionId: string };

const PREVIEW_LIMIT = 50;

const byConnection = (ref: ConnectionRef) =>
  and(
    eq(marketplaceOrderPreviews.workspaceId, ref.workspaceId),
    eq(marketplaceOrderPreviews.connectionId, ref.connectionId)
  );

const newestFirst = (
  a: MarketplaceOrderPreviewRow,
  b: MarketplaceOrderPreviewRow
) => (b.orderedAt?.getTime() ?? -1) - (a.orderedAt?.getTime() ?? -1);

/**
 * Postgres-backed `OrderPreviewStore` (UTA-39 / US20, RFC 04 task 73).
 * `replace` swaps a connection's PII-free previews for the newest 50
 * rows (run it inside `withTransaction` for atomicity); `list` reads
 * them newest first, matching `InMemoryOrderPreviewStore`.
 */
export class DrizzleOrderPreviewStore implements OrderPreviewStore {
  constructor(private readonly db: DbOrTx) {}

  withTransaction(tx: DbOrTx): DrizzleOrderPreviewStore {
    return new DrizzleOrderPreviewStore(tx);
  }

  async replace(
    ref: ConnectionRef,
    rows: readonly MarketplaceOrderPreviewRow[]
  ): Promise<number> {
    const kept = [...rows].sort(newestFirst).slice(0, PREVIEW_LIMIT);
    await this.db.delete(marketplaceOrderPreviews).where(byConnection(ref));
    if (kept.length === 0) return 0;
    await this.db.insert(marketplaceOrderPreviews).values(
      kept.map((r) => ({
        ...ref,
        externalOrderId: r.externalOrderId,
        providerStatus: r.providerStatus,
        orderedAt: r.orderedAt,
        lineCount: r.lineCount,
        totalCents: r.totalCents,
      }))
    );
    return kept.length;
  }

  async list(ref: ConnectionRef): Promise<OrderPreviewView[]> {
    const rows = await this.db
      .select()
      .from(marketplaceOrderPreviews)
      .where(byConnection(ref))
      .orderBy(sql`${marketplaceOrderPreviews.orderedAt} desc nulls last`)
      .limit(PREVIEW_LIMIT);
    return rows.map((row: PreviewDbRow) => ({
      connectionId: row.connectionId,
      externalOrderId: row.externalOrderId,
      providerStatus: row.providerStatus,
      orderedAt: row.orderedAt,
      lineCount: row.lineCount,
      totalCents: row.totalCents,
    }));
  }
}
