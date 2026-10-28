import { and, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import { isMarketplaceProvider } from '@tokoboss/domain';
import type {
  InventorySyncMappingRef,
  InventorySyncScope,
} from '@tokoboss/application';
import type { DatabaseHandle, Transaction } from '../db';
import {
  catalogChannelMappings,
  catalogVariants,
  marketplaceConnections,
  marketplaceInventorySyncStates,
  marketplaceListings,
  type CatalogChannelMappingRow,
  type MarketplaceConnectionRow,
  type MarketplaceInventorySyncStateRow,
} from '../schema/index';

/**
 * Scope + row helpers for Drizzle inventory sync reads (UTA-37 / US04, RFC
 * 06 task 29a): workspace-scoped, no archived mappings, state LEFT JOINed.
 */

export type DbOrTx = Transaction | DatabaseHandle;

/** WHERE for active mappings matching every filter set on the scope. */
export function inventorySyncScopeWhere(scope: InventorySyncScope): SQL {
  const m = catalogChannelMappings;
  return and(
    eq(m.workspaceId, scope.workspaceId),
    isNull(m.archivedAt),
    scope.mappingId ? eq(m.id, scope.mappingId) : undefined,
    scope.variantIds ? inArray(m.variantId, [...scope.variantIds]) : undefined,
    scope.connectionId ? eq(m.connectionId, scope.connectionId) : undefined
  ) as SQL;
}

export interface ScopedMappingRow {
  mapping: CatalogChannelMappingRow;
  skuCode: string;
  connection: MarketplaceConnectionRow | null;
  state: MarketplaceInventorySyncStateRow | null;
  storeSkuText: string | null;
}

/** Mapping + state rows in scope; empty variantIds = nothing in scope. */
export async function selectScopedMappings(
  db: DbOrTx,
  scope: InventorySyncScope
): Promise<ScopedMappingRow[]> {
  const m = catalogChannelMappings;
  const v = catalogVariants;
  const c = marketplaceConnections;
  const l = marketplaceListings;
  const s = marketplaceInventorySyncStates;
  const ws = scope.workspaceId;
  if (scope.variantIds?.length === 0) return [];
  return db
    .select({
      mapping: m,
      skuCode: v.skuCode,
      connection: c,
      state: s,
      storeSkuText: l.storeSkuText,
    })
    .from(m)
    .innerJoin(v, and(eq(v.id, m.variantId), eq(v.workspaceId, ws)))
    .leftJoin(c, and(eq(c.id, m.connectionId), eq(c.workspaceId, ws)))
    .leftJoin(
      l,
      and(
        eq(l.connectionId, m.connectionId),
        eq(l.platformSkuId, m.platformSkuId)
      )
    )
    .leftJoin(s, and(eq(s.mappingId, m.id), eq(s.workspaceId, ws)))
    .where(inventorySyncScopeWhere(scope));
}

export function toInventorySyncMappingRef(
  row: ScopedMappingRow
): InventorySyncMappingRef {
  const { channel } = row.mapping;
  if (!isMarketplaceProvider(channel))
    throw new Error(`Bad channel ${channel}`);
  return {
    mappingId: row.mapping.id,
    variantId: row.mapping.variantId,
    skuCode: row.skuCode,
    storeSkuText: row.storeSkuText,
    platformSkuId: row.mapping.platformSkuId,
    channel,
    storeDisplayName: row.connection?.storeName ?? null,
  };
}
