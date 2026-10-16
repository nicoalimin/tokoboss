import { and, asc, eq, or } from 'drizzle-orm';
import {
  stockCountNotFound,
  stockCountVersionConflict,
  type StockCountEntryRecord,
  type StockCountLineRecord,
  type UpdateStockCountLineReviewInput,
} from '@tokoboss/application';
import type { DatabaseHandle, Transaction } from '../db';
import {
  catalogVariants,
  stockCountEntries,
  stockCountLines,
  type StockCountEntryRow,
  type StockCountLineRow,
} from '../schema/index';
import { toStockCountLine } from './drizzle-stock-count-mappers';

/**
 * Line reads + review update for stock opname (US12 / RFC 03 task 22f):
 * findLineByScan, listEntries, updateLineReview. recordEntry is row 23.
 */

type DbOrTx = Transaction | DatabaseHandle;

/** Barcode first, then sku_code, among the session's lines only. */
export async function findLineByScan(
  db: DbOrTx,
  workspaceId: string,
  sessionId: string,
  code: string
): Promise<StockCountLineRecord | null> {
  const rows = await db
    .select({ line: stockCountLines, barcode: catalogVariants.barcode })
    .from(stockCountLines)
    .innerJoin(
      catalogVariants,
      eq(catalogVariants.id, stockCountLines.variantId)
    )
    .where(
      and(
        eq(stockCountLines.workspaceId, workspaceId),
        eq(stockCountLines.sessionId, sessionId),
        eq(catalogVariants.workspaceId, workspaceId),
        or(eq(catalogVariants.barcode, code), eq(catalogVariants.skuCode, code))
      )
    );
  type Hit = { line: StockCountLineRow; barcode: string | null };
  const hits: Hit[] = rows;
  const hit = hits.find((r) => r.barcode === code) ?? hits[0];
  return hit ? toStockCountLine(hit.line) : null;
}

export async function listEntries(
  db: DbOrTx,
  workspaceId: string,
  lineId: string
): Promise<StockCountEntryRecord[]> {
  const rows = await db
    .select()
    .from(stockCountEntries)
    .where(
      and(
        eq(stockCountEntries.workspaceId, workspaceId),
        eq(stockCountEntries.lineId, lineId)
      )
    )
    .orderBy(asc(stockCountEntries.createdAt));
  return rows.map((row: StockCountEntryRow) => ({
    ...row,
    deviceLabel: row.deviceLabel ?? null,
  }));
}

/** Reason code / note / flag tick; guarded on line version. */
export async function updateLineReview(
  db: DbOrTx,
  input: UpdateStockCountLineReviewInput
): Promise<StockCountLineRecord> {
  const where = and(
    eq(stockCountLines.id, input.lineId),
    eq(stockCountLines.workspaceId, input.workspaceId)
  );
  const updated = await db
    .update(stockCountLines)
    .set({
      varianceReasonCode: input.varianceReasonCode,
      varianceNote: input.varianceNote,
      flagVerified: input.flagVerified,
      version: input.expectedVersion + 1,
      updatedAt: new Date(),
    })
    .where(and(where, eq(stockCountLines.version, input.expectedVersion)))
    .returning();
  const row = updated[0];
  if (row) return toStockCountLine(row);
  const current = await db.select().from(stockCountLines).where(where).limit(1);
  const cur = current[0];
  if (!cur) throw stockCountNotFound();
  throw stockCountVersionConflict(cur.version);
}
