import { and, eq } from 'drizzle-orm';
import {
  mergeEntry,
  stockCountNotFound,
  type RecordStockCountEntryInput,
  type RecordStockCountEntryResult,
} from '@tokoboss/application';
import type { DatabaseHandle, Transaction } from '../db';
import {
  catalogInventoryLevels,
  stockCountEntries,
  stockCountLines,
  stockCountSessions,
} from '../schema/index';
import { toStockCountLine } from './drizzle-stock-count-mappers';
import {
  findEntryByClientId,
  toStockCountEntry,
} from './stock-count-entry-dedupe';

/**
 * Drizzle entry writer (US12 / RFC 03 task 23b): row-locked recordEntry
 * (add/replace merge). Call inside a transaction so FOR UPDATE holds.
 */

type DbOrTx = Transaction | DatabaseHandle;

/** Port: recordEntry — dedupe, FOR UPDATE line, merge qty, append, touch session. */
export async function recordEntry(
  db: DbOrTx,
  input: RecordStockCountEntryInput
): Promise<RecordStockCountEntryResult> {
  const existing = await findEntryByClientId(
    db,
    input.workspaceId,
    input.clientEntryId
  );
  if (existing) {
    return { ...existing, deduplicated: true };
  }

  const line = (
    await db
      .select()
      .from(stockCountLines)
      .where(
        and(
          eq(stockCountLines.id, input.lineId),
          eq(stockCountLines.workspaceId, input.workspaceId)
        )
      )
      .limit(1)
      .for('update')
  )[0];
  if (!line) throw stockCountNotFound();

  const systemQty =
    (
      await db
        .select({ qty: catalogInventoryLevels.qty })
        .from(catalogInventoryLevels)
        .where(
          and(
            eq(catalogInventoryLevels.workspaceId, input.workspaceId),
            eq(catalogInventoryLevels.variantId, line.variantId),
            eq(catalogInventoryLevels.warehouseId, line.warehouseId)
          )
        )
        .limit(1)
    )[0]?.qty ?? 0;

  const [newLine] = await db
    .update(stockCountLines)
    .set({
      countedQty: mergeEntry(line.countedQty, input.qty, input.mode),
      systemQtyAtCount: systemQty,
      countedAt: input.now,
      countedBy: input.actorId,
      entryCount: line.entryCount + 1,
      version: line.version + 1,
      updatedAt: input.now,
    })
    .where(eq(stockCountLines.id, line.id))
    .returning();

  const [entry] = await db
    .insert(stockCountEntries)
    .values({
      workspaceId: input.workspaceId,
      sessionId: line.sessionId,
      lineId: line.id,
      qty: input.qty,
      mode: input.mode,
      clientEntryId: input.clientEntryId,
      deviceLabel: input.deviceLabel,
      actorId: input.actorId,
      createdAt: input.now,
    })
    .returning();

  await db
    .update(stockCountSessions)
    .set({ lastActivityAt: input.now })
    .where(
      and(
        eq(stockCountSessions.id, line.sessionId),
        eq(stockCountSessions.workspaceId, input.workspaceId)
      )
    );

  return {
    line: toStockCountLine(newLine!),
    entry: toStockCountEntry(entry!),
    deduplicated: false,
  };
}
