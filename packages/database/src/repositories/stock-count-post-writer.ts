import { and, eq } from 'drizzle-orm';
import {
  computeVariance,
  ledgerReasonFor,
  stockCountNotFound,
  stockCountValidation,
  stockCountVersionConflict,
  type PostStockCountSessionInput,
  type StockCountPostResult,
} from '@tokoboss/application';
import type { DatabaseHandle, Transaction } from '../db';
import { stockCountLines, stockCountSessions } from '../schema/index';
import { DrizzleCatalogStore } from './drizzle-catalog-repository';
import { toStockCountSession } from './drizzle-stock-count-mappers';

/**
 * Drizzle post writer (US12 / RFC 03 task 24a). Call inside ONE transaction;
 * ledger deltas go through adjustLevel. Replay of a posted session dedupes.
 */

type DbOrTx = Transaction | DatabaseHandle;

/** Port: postSession — single-transaction post with ledger deltas. */
export async function postSession(
  db: DbOrTx,
  input: PostStockCountSessionInput
): Promise<StockCountPostResult> {
  const session = (
    await db
      .select()
      .from(stockCountSessions)
      .where(
        and(
          eq(stockCountSessions.id, input.sessionId),
          eq(stockCountSessions.workspaceId, input.workspaceId)
        )
      )
      .limit(1)
      .for('update')
  )[0];
  if (!session) throw stockCountNotFound();

  const lines = await db
    .select()
    .from(stockCountLines)
    .where(
      and(
        eq(stockCountLines.sessionId, session.id),
        eq(stockCountLines.workspaceId, input.workspaceId)
      )
    );

  if (session.status === 'posted') {
    const postedLines = lines.filter(
      (l: { ledgerEntryId: string | null }) => l.ledgerEntryId !== null
    ).length;
    const replay = toStockCountSession(session);
    return { session: replay, postedLines, deduplicated: true };
  }
  if (session.version !== input.expectedVersion) {
    throw stockCountVersionConflict(session.version);
  }
  if (session.status !== 'submitted') {
    throw stockCountValidation('session must be submitted to post');
  }

  const catalog = new DrizzleCatalogStore(db);
  let postedLines = 0;
  for (const line of lines) {
    const variance = computeVariance(line);
    const reason = ledgerReasonFor(variance);
    let ledgerEntryId = line.ledgerEntryId;
    if (reason !== null && variance !== null) {
      const { entry } = await catalog.adjustLevel({
        workspaceId: input.workspaceId,
        variantId: line.variantId,
        warehouseId: line.warehouseId,
        delta: variance,
        reason,
        actorId: input.actorId,
        correlationId: session.id,
        idempotencyKey: `opname:${session.id}:${line.id}`,
        allowNegative: true,
      });
      ledgerEntryId = entry.id;
      postedLines += 1;
    }
    await db
      .update(stockCountLines)
      .set({ ledgerEntryId, isOpen: false, updatedAt: input.now })
      .where(eq(stockCountLines.id, line.id));
  }

  const [posted] = await db
    .update(stockCountSessions)
    .set({
      status: 'posted',
      postedBy: input.actorId,
      postedAt: input.now,
      selfApproved: input.selfApproved,
      lastActivityAt: input.now,
      version: session.version + 1,
      updatedAt: input.now,
    })
    .where(eq(stockCountSessions.id, session.id))
    .returning();

  return {
    session: toStockCountSession(posted!),
    postedLines,
    deduplicated: false,
  };
}
