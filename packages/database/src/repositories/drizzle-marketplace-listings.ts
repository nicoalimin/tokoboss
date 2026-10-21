import { and, count, eq, sql } from 'drizzle-orm';
import type {
  ListingMappingState,
  ListingRowView,
  ListingUpsertInput,
} from '@tokoboss/application';
import type { DatabaseHandle, Transaction } from '../db';
import {
  marketplaceListings,
  type MarketplaceListingRow,
} from '../schema/index';

type DbOrTx = Transaction | DatabaseHandle;
type ConnectionRef = { workspaceId: string; connectionId: string };

const excluded = (column: string) => sql.raw(`excluded.${column}`);

const toListingRowView = (row: MarketplaceListingRow): ListingRowView => ({
  connectionId: row.connectionId,
  externalItemId: row.externalItemId,
  platformSkuId: row.platformSkuId,
  storeSkuText: row.storeSkuText,
  barcodeHint: row.barcodeHint,
  title: row.title,
  variantName: row.variantName,
  listingStatus: row.listingStatus,
  providerStock: row.providerStock,
  mappingState: row.mappingState as ListingMappingState,
  suggestedVariantIds: row.suggestedVariantIds,
  lastSeenAt: row.lastSeenAt,
});

const byConnection = (ref: ConnectionRef) =>
  and(
    eq(marketplaceListings.workspaceId, ref.workspaceId),
    eq(marketplaceListings.connectionId, ref.connectionId)
  );

/**
 * Postgres-backed listing half of `ListingStore` (UTA-39 / US20, RFC 04
 * task 72a). One page upserts on (connection_id, platform_sku_id).
 * Location links (72b) and mapping archive (74) live in sibling files.
 */
export class DrizzleListingRowStore {
  constructor(private readonly db: DbOrTx) {}

  withTransaction(tx: DbOrTx): DrizzleListingRowStore {
    return new DrizzleListingRowStore(tx);
  }

  async upsertPage(
    ref: ConnectionRef,
    rows: ListingUpsertInput[]
  ): Promise<number> {
    if (rows.length === 0) return 0;
    await this.db
      .insert(marketplaceListings)
      .values(rows.map((row) => ({ ...row, ...ref })))
      .onConflictDoUpdate({
        target: [
          marketplaceListings.connectionId,
          marketplaceListings.platformSkuId,
        ],
        set: {
          externalItemId: excluded('external_item_id'),
          storeSkuText: excluded('store_sku_text'),
          barcodeHint: excluded('barcode_hint'),
          title: excluded('title'),
          variantName: excluded('variant_name'),
          listingStatus: excluded('listing_status'),
          providerStock: excluded('provider_stock'),
          mappingState: excluded('mapping_state'),
          suggestedVariantIds: excluded('suggested_variant_ids'),
          lastSeenAt: excluded('last_seen_at'),
          updatedAt: new Date(),
        },
      });
    return rows.length;
  }

  async list(ref: ConnectionRef): Promise<ListingRowView[]> {
    const rows = await this.db
      .select()
      .from(marketplaceListings)
      .where(byConnection(ref))
      .orderBy(marketplaceListings.platformSkuId);
    return rows.map(toListingRowView);
  }

  async countMapped(ref: ConnectionRef): Promise<number> {
    const rows = await this.db
      .select({ n: count() })
      .from(marketplaceListings)
      .where(
        and(byConnection(ref), eq(marketplaceListings.mappingState, 'mapped'))
      );
    return rows[0]?.n ?? 0;
  }
}
