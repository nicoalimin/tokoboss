import { and, eq, isNull } from 'drizzle-orm';
import type {
  SkuMappingOverviewQueryInput,
  SkuMappingReadStore,
} from '@tokoboss/application';
import type { DatabaseHandle, Transaction } from '../db';
import {
  catalogChannelMappings,
  catalogVariants,
  marketplaceConnections,
  marketplaceListings,
  type CatalogChannelMappingRow,
  type CatalogVariantRow,
} from '../schema/index';
import { listSkuMappingHistory } from './drizzle-sku-mapping-history-reads';
import { selectMappableListings } from './drizzle-sku-mapping-listing-reads';
import { toSkuMappingRecord } from './drizzle-sku-mapping-mappers';
import { loadDrizzleSkuMappingOverview } from './drizzle-sku-mapping-overview';
import { toMappableVariant } from './drizzle-sku-mapping-overview-variants';

/**
 * DrizzleSkuMappingReadStore (UTA-40 / US03, RFC 05 task 22f): the
 * SkuMappingReadStore port. Workspace-scoped like the in-memory fake:
 * another workspace's rows miss (null / empty). Listing reads: 22a;
 * overview: 22b-22d; history: 22e. Facade + tx runner: row 23.
 */

type DbOrTx = Transaction | DatabaseHandle;

export class DrizzleSkuMappingReadStore implements SkuMappingReadStore {
  constructor(private readonly db: DbOrTx) {}

  loadOverview(input: SkuMappingOverviewQueryInput) {
    return loadDrizzleSkuMappingOverview(this.db, input);
  }

  listHistory(input: Parameters<SkuMappingReadStore['listHistory']>[0]) {
    return listSkuMappingHistory(this.db, input);
  }

  async findVariant(workspaceId: string, variantId: string) {
    const v = catalogVariants;
    const rows: CatalogVariantRow[] = await this.db
      .select()
      .from(v)
      .where(and(eq(v.workspaceId, workspaceId), eq(v.id, variantId)))
      .limit(1);
    return rows[0] ? toMappableVariant(rows[0]) : null;
  }

  async findListing(workspaceId: string, listingId: string) {
    const where = eq(marketplaceListings.id, listingId);
    const rows = await selectMappableListings(this.db, workspaceId, where);
    return rows[0] ?? null;
  }

  /** Live mapping only (archived → null, use case 404s) + its listing. */
  async findMapping(workspaceId: string, mappingId: string) {
    const m = catalogChannelMappings;
    const rows: CatalogChannelMappingRow[] = await this.db
      .select()
      .from(m)
      .where(
        and(
          eq(m.workspaceId, workspaceId),
          eq(m.id, mappingId),
          isNull(m.archivedAt)
        )
      )
      .limit(1);
    if (!rows[0]) return null;
    const mapping = toSkuMappingRecord(rows[0]);
    const listings = await selectMappableListings(
      this.db,
      workspaceId,
      and(
        eq(marketplaceConnections.provider, mapping.channel),
        eq(marketplaceConnections.providerStoreId, mapping.shopExtId),
        eq(marketplaceListings.platformSkuId, mapping.platformSkuId)
      )
    );
    return { mapping, listing: listings[0] ?? null };
  }
}
