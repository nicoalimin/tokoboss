import { and, eq, inArray } from 'drizzle-orm';
import type {
  CreateStockCountSessionInput,
  StockCountSessionRecord,
} from '@tokoboss/application';
import type { DatabaseHandle, Transaction } from '../db';
import {
  catalogInventoryLevels,
  stockCountLines,
  stockCountSessions,
} from '../schema/index';
import { listEligibleVariantIds } from './drizzle-stock-count-eligible';
import { toStockCountSession } from './drizzle-stock-count-mappers';
import {
  assertNoOpenOverlap,
  nextSessionCode,
} from './drizzle-stock-count-session-code';

/**
 * Session creation for stock opname (US12 / RFC 03 task 22e-ii).
 * Eligible variants → overlap → code → INSERT session + snapshot lines.
 */

type DbOrTx = Transaction | DatabaseHandle;

/** Port: createSession (session + snapshot lines on the given db/tx). */
export async function createSession(
  db: DbOrTx,
  input: CreateStockCountSessionInput
): Promise<{ session: StockCountSessionRecord; lineCount: number }> {
  const { workspaceId, warehouseId, now } = input;
  const variantIds = await listEligibleVariantIds(
    db,
    workspaceId,
    input.variantIds
  );
  await assertNoOpenOverlap(db, workspaceId, warehouseId, variantIds);
  const code = await nextSessionCode(db, workspaceId, now);
  const inserted = await db
    .insert(stockCountSessions)
    .values({
      workspaceId,
      warehouseId,
      code,
      name: input.name,
      scopeType: input.scopeType,
      status: 'counting',
      freezeOutboundTransfers: input.freezeOutboundTransfers,
      snapshotAt: now,
      createdBy: input.actorId,
      lastActivityAt: now,
      version: 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const row = inserted[0]!;
  if (variantIds.length > 0) {
    const qtyRows = await db
      .select({
        variantId: catalogInventoryLevels.variantId,
        qty: catalogInventoryLevels.qty,
      })
      .from(catalogInventoryLevels)
      .where(
        and(
          eq(catalogInventoryLevels.workspaceId, workspaceId),
          eq(catalogInventoryLevels.warehouseId, warehouseId),
          inArray(catalogInventoryLevels.variantId, variantIds)
        )
      );
    const qtyByVariant = new Map(
      qtyRows.map((r: { variantId: string; qty: number }) => [
        r.variantId,
        r.qty,
      ])
    );
    await db.insert(stockCountLines).values(
      variantIds.map((variantId) => ({
        workspaceId,
        sessionId: row.id,
        warehouseId,
        variantId,
        snapshotQty: qtyByVariant.get(variantId) ?? 0,
        isOpen: true,
        entryCount: 0,
        flagVerified: false,
        version: 1,
        createdAt: now,
        updatedAt: now,
      }))
    );
  }
  return { session: toStockCountSession(row), lineCount: variantIds.length };
}
