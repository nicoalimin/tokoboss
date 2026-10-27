import { and, desc, eq, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type {
  SkuMappingHistoryEntry,
  SkuMappingReadStore,
} from '@tokoboss/application';
import type { DatabaseHandle, Transaction } from '../db';
import {
  catalogChannelMappingEvents,
  catalogVariants,
  marketplaceConnections,
  userProfiles,
  type CatalogChannelMappingEventRow,
} from '../schema/index';
import {
  type SkuMappingHistoryJoin,
  toSkuMappingHistoryEntry,
} from './drizzle-sku-mapping-history-mapper';

/**
 * listHistory for the Drizzle SKU mapping read store (UTA-40 / US03,
 * RFC 05 task 22e). Newest first (createdAt, then id); variantId also
 * matches remaps away from it. Joins are workspace-scoped; the actor
 * name comes from user_profiles (mapper 20b falls back, never email).
 */

type DbOrTx = Transaction | DatabaseHandle;
type HistoryQuery = Parameters<SkuMappingReadStore['listHistory']>[0];
type HistoryRow = {
  event: CatalogChannelMappingEventRow;
} & SkuMappingHistoryJoin;

export async function listSkuMappingHistory(
  db: DbOrTx,
  input: HistoryQuery
): Promise<SkuMappingHistoryEntry[]> {
  const { workspaceId: ws, variantId, limit } = input;
  const e = catalogChannelMappingEvents;
  const cur = alias(catalogVariants, 'cur_variant');
  const prev = alias(catalogVariants, 'prev_variant');
  const c = marketplaceConnections;
  const u = userProfiles;
  const rows: HistoryRow[] = await db
    .select({
      event: e,
      skuCode: cur.skuCode,
      previousSkuCode: prev.skuCode,
      storeDisplayName: c.storeName,
      actorDisplayName: u.displayName,
    })
    .from(e)
    .leftJoin(cur, and(eq(cur.id, e.variantId), eq(cur.workspaceId, ws)))
    .leftJoin(
      prev,
      and(eq(prev.id, e.previousVariantId), eq(prev.workspaceId, ws))
    )
    .leftJoin(c, and(eq(c.id, e.connectionId), eq(c.workspaceId, ws)))
    .leftJoin(u, eq(u.userId, e.actorId))
    .where(
      and(
        eq(e.workspaceId, ws),
        variantId
          ? or(eq(e.variantId, variantId), eq(e.previousVariantId, variantId))
          : undefined
      )
    )
    .orderBy(desc(e.createdAt), desc(e.id))
    .limit(limit);
  return rows.map(({ event, ...joined }) =>
    toSkuMappingHistoryEntry(event, joined)
  );
}
