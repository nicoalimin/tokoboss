import { and, desc, eq, inArray, like } from 'drizzle-orm';
import { stockCountOverlap } from '@tokoboss/application';
import type { DatabaseHandle, Transaction } from '../db';
import { stockCountLines, stockCountSessions } from '../schema/index';

/**
 * createSession helpers for stock opname (US12 / RFC 03 task 22e-i).
 * Session code + open-line overlap; used by createSession (22e-ii).
 */

type DbOrTx = Transaction | DatabaseHandle;

/** `OPN-YYYY-NNNN`, numbered per workspace and UTC year. */
export async function nextSessionCode(
  db: DbOrTx,
  workspaceId: string,
  now: Date
): Promise<string> {
  const year = now.getUTCFullYear();
  const prefix = `OPN-${year}-`;
  const rows = await db
    .select({ code: stockCountSessions.code })
    .from(stockCountSessions)
    .where(
      and(
        eq(stockCountSessions.workspaceId, workspaceId),
        like(stockCountSessions.code, `${prefix}%`)
      )
    )
    .orderBy(desc(stockCountSessions.code))
    .limit(1);
  const last = rows[0]?.code;
  const n = last ? Number(last.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, '0')}`;
}

/** Throws STOCK_COUNT_OVERLAP if any warehouse+variant already has an open line. */
export async function assertNoOpenOverlap(
  db: DbOrTx,
  workspaceId: string,
  warehouseId: string,
  variantIds: string[]
): Promise<void> {
  if (variantIds.length === 0) return;
  const open = await db
    .select({ sessionId: stockCountLines.sessionId })
    .from(stockCountLines)
    .where(
      and(
        eq(stockCountLines.workspaceId, workspaceId),
        eq(stockCountLines.warehouseId, warehouseId),
        eq(stockCountLines.isOpen, true),
        inArray(stockCountLines.variantId, variantIds)
      )
    )
    .limit(1);
  if (open[0]) throw stockCountOverlap(open[0].sessionId);
}
