import {
  and,
  eq,
  isNotNull,
  max,
  sql,
  type Column,
  type SQL,
} from 'drizzle-orm';
import {
  catalogChannelMappings as cm,
  catalogWarehouses as wh,
  marketplaceInventorySyncStates as ss,
  marketplaceLocationLinks as ll,
  marketplaceOrderPreviews as op,
} from '../schema/index';
import type { DbOrTx } from './drizzle-inventory-sync-scope';

/**
 * Grouped per-connection queries behind DrizzleIntegrationMetricsReads
 * (UTA-38 / US18, RFC 07 row 19a): one query per table, workspace-scoped,
 * optionally narrowed to one connection. Merging lives in row 19b.
 */

export interface IntegrationMetricRows {
  maps: { id: string; active: number; archived: number }[];
  syncs: {
    id: string;
    conflict: number;
    rateLimited: number;
    lastPush: Date | null;
  }[];
  orders: { id: string; last: Date | null }[];
  /** One row per distinct linked warehouse, ordered by code. */
  links: { id: string; code: string }[];
}

const RATE_LIMITED = 'SYNC_RATE_LIMITED';
const tally = (where: SQL) =>
  sql<number>`count(*) filter (where ${where})`.mapWith(Number);
/** Enabled SKU in needs_attention; rate-limited is split from conflicts. */
const failing = sql`${ss.syncEnabled} and ${ss.syncStatus} = 'needs_attention'`;

export async function selectIntegrationMetricRows(
  db: DbOrTx,
  workspaceId: string,
  connectionId?: string
): Promise<IntegrationMetricRows> {
  const scope = (ws: Column, conn: Column) =>
    and(
      eq(ws, workspaceId),
      connectionId ? eq(conn, connectionId) : isNotNull(conn)
    );
  const maps = await db
    .select({
      id: cm.connectionId,
      active: tally(sql`${cm.archivedAt} is null`),
      archived: tally(sql`${cm.archivedAt} is not null`),
    })
    .from(cm)
    .where(scope(cm.workspaceId, cm.connectionId))
    .groupBy(cm.connectionId);
  const syncs = await db
    .select({
      id: ss.connectionId,
      conflict: tally(
        sql`${failing} and ${ss.lastErrorCode} is distinct from ${RATE_LIMITED}`
      ),
      rateLimited: tally(
        sql`${failing} and ${ss.lastErrorCode} = ${RATE_LIMITED}`
      ),
      lastPush: max(ss.lastSyncedAt),
    })
    .from(ss)
    .where(scope(ss.workspaceId, ss.connectionId))
    .groupBy(ss.connectionId);
  const orders = await db
    .select({ id: op.connectionId, last: max(op.createdAt) })
    .from(op)
    .where(scope(op.workspaceId, op.connectionId))
    .groupBy(op.connectionId);
  const links = await db
    .select({ id: ll.connectionId, code: wh.code })
    .from(ll)
    .innerJoin(wh, eq(wh.id, ll.warehouseId))
    .where(scope(ll.workspaceId, ll.connectionId))
    .groupBy(ll.connectionId, wh.code)
    .orderBy(wh.code);
  return { maps, syncs, orders, links } as IntegrationMetricRows;
}
