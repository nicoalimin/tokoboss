import { and, eq, sql } from 'drizzle-orm';
import {
  stockCountNotFound,
  stockCountValidation,
  stockCountVersionConflict,
  type StockCountSessionRecord,
  type UpdateStockCountSessionInput,
} from '@tokoboss/application';
import type { DatabaseHandle, Transaction } from '../db';
import { stockCountLines, stockCountSessions } from '../schema/index';
import { toStockCountSession } from './drizzle-stock-count-mappers';

/**
 * Session write helpers for stock opname (US12 / RFC 03 task 22c).
 * `updateSession` only (submit/return/cancel/freeze). createSession later.
 */

type DbOrTx = Transaction | DatabaseHandle;

/** Submit / return / cancel / freeze; guarded on version + status. */
export async function updateSession(
  db: DbOrTx,
  input: UpdateStockCountSessionInput
): Promise<StockCountSessionRecord> {
  const updated = await db
    .update(stockCountSessions)
    .set({
      ...input.changes,
      version: input.expectedVersion + 1,
      updatedAt: input.now,
      lastActivityAt: input.now,
    })
    .where(
      and(
        eq(stockCountSessions.id, input.sessionId),
        eq(stockCountSessions.workspaceId, input.workspaceId),
        eq(stockCountSessions.version, input.expectedVersion),
        eq(stockCountSessions.status, input.expectedStatus)
      )
    )
    .returning();
  const row = updated[0];
  if (!row) {
    const current = await db
      .select()
      .from(stockCountSessions)
      .where(
        and(
          eq(stockCountSessions.id, input.sessionId),
          eq(stockCountSessions.workspaceId, input.workspaceId)
        )
      )
      .limit(1);
    const cur = current[0];
    if (!cur) throw stockCountNotFound();
    if (cur.status !== input.expectedStatus) {
      throw stockCountValidation('Session is not in the expected status.');
    }
    throw stockCountVersionConflict(cur.version);
  }
  if (input.clearReview || input.closeLines) {
    await db
      .update(stockCountLines)
      .set({
        version: sql`${stockCountLines.version} + 1`,
        updatedAt: input.now,
        ...(input.clearReview
          ? {
              varianceReasonCode: null,
              varianceNote: null,
              flagVerified: false,
            }
          : {}),
        ...(input.closeLines ? { isOpen: false } : {}),
      })
      .where(
        and(
          eq(stockCountLines.sessionId, input.sessionId),
          eq(stockCountLines.workspaceId, input.workspaceId)
        )
      );
  }
  return toStockCountSession(row);
}
