import { and, eq } from 'drizzle-orm';
import type {
  StockCountEntryRecord,
  StockCountLineRecord,
} from '@tokoboss/application';
import type { DatabaseHandle, Transaction } from '../db';
import {
  stockCountEntries,
  stockCountLines,
  type StockCountEntryRow,
} from '../schema/index';
import { toStockCountLine } from './drizzle-stock-count-mappers';

/**
 * Entry dedupe helpers for stock opname (US12 / RFC 03 task 23a).
 * Used by stock-count-entry-writer (23b).
 */

type DbOrTx = Transaction | DatabaseHandle;

export function toStockCountEntry(
  row: StockCountEntryRow
): StockCountEntryRecord {
  return { ...row, deviceLabel: row.deviceLabel ?? null };
}

/** Lookup by workspace + clientEntryId; returns entry + line or null. */
export async function findEntryByClientId(
  db: DbOrTx,
  workspaceId: string,
  clientEntryId: string
): Promise<{
  entry: StockCountEntryRecord;
  line: StockCountLineRecord;
} | null> {
  const seen = (
    await db
      .select()
      .from(stockCountEntries)
      .where(
        and(
          eq(stockCountEntries.workspaceId, workspaceId),
          eq(stockCountEntries.clientEntryId, clientEntryId)
        )
      )
      .limit(1)
  )[0];
  if (!seen) return null;
  const line = (
    await db
      .select()
      .from(stockCountLines)
      .where(
        and(
          eq(stockCountLines.id, seen.lineId),
          eq(stockCountLines.workspaceId, workspaceId)
        )
      )
      .limit(1)
  )[0];
  if (!line) return null;
  return { entry: toStockCountEntry(seen), line: toStockCountLine(line) };
}
