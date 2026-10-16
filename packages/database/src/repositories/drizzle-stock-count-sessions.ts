import { and, eq, inArray } from 'drizzle-orm';
import type {
  ListStockCountSessionsInput,
  StockCountLineRecord,
  StockCountSessionRecord,
} from '@tokoboss/application';
import type { DatabaseHandle, Transaction } from '../db';
import { stockCountLines, stockCountSessions } from '../schema/index';
import {
  toStockCountLine,
  toStockCountSession,
} from './drizzle-stock-count-mappers';

/**
 * Session/line read helpers for stock opname (US12 / RFC 03 task 22b).
 * Used by `DrizzleStockCountStore`. Writes stay in sibling modules.
 */

type DbOrTx = Transaction | DatabaseHandle;

export async function findSession(
  db: DbOrTx,
  workspaceId: string,
  sessionId: string
): Promise<StockCountSessionRecord | null> {
  const rows = await db
    .select()
    .from(stockCountSessions)
    .where(
      and(
        eq(stockCountSessions.id, sessionId),
        eq(stockCountSessions.workspaceId, workspaceId)
      )
    )
    .limit(1);
  const row = rows[0];
  return row ? toStockCountSession(row) : null;
}

export async function listSessions(
  db: DbOrTx,
  input: ListStockCountSessionsInput
): Promise<StockCountSessionRecord[]> {
  const filters = [eq(stockCountSessions.workspaceId, input.workspaceId)];
  if (input.warehouseIds !== null) {
    if (input.warehouseIds.length === 0) return [];
    filters.push(inArray(stockCountSessions.warehouseId, input.warehouseIds));
  }
  if (input.statuses && input.statuses.length > 0) {
    filters.push(inArray(stockCountSessions.status, input.statuses));
  }
  const rows = await db
    .select()
    .from(stockCountSessions)
    .where(and(...filters));
  return rows.map(toStockCountSession);
}

/** First counting/submitted session in the warehouse (optional freeze filter). */
export async function findActiveSession(
  db: DbOrTx,
  workspaceId: string,
  warehouseId: string,
  options?: { freezingOnly?: boolean }
): Promise<StockCountSessionRecord | null> {
  const filters = [
    eq(stockCountSessions.workspaceId, workspaceId),
    eq(stockCountSessions.warehouseId, warehouseId),
    inArray(stockCountSessions.status, ['counting', 'submitted']),
  ];
  if (options?.freezingOnly) {
    filters.push(eq(stockCountSessions.freezeOutboundTransfers, true));
  }
  const rows = await db
    .select()
    .from(stockCountSessions)
    .where(and(...filters))
    .limit(1);
  const row = rows[0];
  return row ? toStockCountSession(row) : null;
}

export async function listLines(
  db: DbOrTx,
  workspaceId: string,
  sessionId: string
): Promise<StockCountLineRecord[]> {
  const rows = await db
    .select()
    .from(stockCountLines)
    .where(
      and(
        eq(stockCountLines.workspaceId, workspaceId),
        eq(stockCountLines.sessionId, sessionId)
      )
    );
  return rows.map(toStockCountLine);
}
