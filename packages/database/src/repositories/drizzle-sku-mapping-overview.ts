import { and, eq, inArray, isNull } from 'drizzle-orm';
import type {
  SkuMappingOverviewQueryInput,
  SkuMappingOverviewSnapshot,
} from '@tokoboss/application';
import type {
  MarketplaceConnectionStatus,
  MarketplaceProvider,
} from '@tokoboss/domain';
import type { DatabaseHandle, Transaction } from '../db';
import {
  catalogChannelMappings,
  marketplaceConnections,
  type CatalogChannelMappingRow,
} from '../schema/index';
import {
  openSkuListings,
  selectMappableListings,
} from './drizzle-sku-mapping-listing-reads';
import { toSkuMappingRecord } from './drizzle-sku-mapping-mappers';
import { loadSkuMappingVariantStock } from './drizzle-sku-mapping-overview-stock';
import { selectSkuMappingVariants } from './drizzle-sku-mapping-overview-variants';

/**
 * Drizzle loadOverview (UTA-40 / US03, RFC 05 task 22d). Mirrors
 * loadInMemorySkuMappingOverview: store-side q / connectionId /
 * variantId scope only; review filter and KPIs stay in
 * getSkuMappingOverview. Soft-removed stores are left out; listings
 * load workspace-wide so each mapping finds its natural-key listing.
 */

type DbOrTx = Transaction | DatabaseHandle;
type StoreSlot = SkuMappingOverviewSnapshot['stores'][number];
type StoreRow = Omit<StoreSlot, 'provider' | 'status'> &
  Record<'provider' | 'status', string>;

/** Natural Store SKU key shared by a mapping and its staged listing. */
type Key = Record<'channel' | 'shopExtId' | 'platformSkuId', string>;
const keyOf = (k: Key) => `${k.channel}|${k.shopExtId}|${k.platformSkuId}`;

export async function loadDrizzleSkuMappingOverview(
  db: DbOrTx,
  input: SkuMappingOverviewQueryInput
): Promise<SkuMappingOverviewSnapshot> {
  const { workspaceId: ws, connectionId } = input;
  const c = marketplaceConnections;
  const m = catalogChannelMappings;
  const storeRows: StoreRow[] = await db
    .select({
      connectionId: c.id,
      provider: c.provider,
      providerStoreId: c.providerStoreId,
      displayName: c.storeName,
      status: c.status,
    })
    .from(c)
    .where(
      and(
        eq(c.workspaceId, ws),
        isNull(c.removedAt),
        connectionId ? eq(c.id, connectionId) : undefined
      )
    )
    .orderBy(c.createdAt);
  const variants = await selectSkuMappingVariants(db, input);
  const listings = await selectMappableListings(db, ws);
  const ids = variants.map((v) => v.id);
  const stock = await loadSkuMappingVariantStock(db, ws, ids);
  const rows: CatalogChannelMappingRow[] =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(m)
          .where(
            and(
              eq(m.workspaceId, ws),
              isNull(m.archivedAt),
              inArray(m.variantId, ids),
              connectionId ? eq(m.connectionId, connectionId) : undefined
            )
          )
          .orderBy(m.createdAt);
  const byKey = new Map(listings.map((l) => [keyOf(l), l]));
  const zero = { totalStockQty: 0, linkedStockQtyByConnection: {} };
  return {
    stores: storeRows.map((s) => ({
      ...s,
      provider: s.provider as MarketplaceProvider,
      status: s.status as MarketplaceConnectionStatus,
    })),
    variants: variants.map((v) => ({ ...v, ...(stock.get(v.id) ?? zero) })),
    mappings: rows.map(toSkuMappingRecord).map((mapping) => ({
      mapping,
      listing: byKey.get(keyOf(mapping)) ?? null,
    })),
    openListings: openSkuListings(listings, input),
  };
}
