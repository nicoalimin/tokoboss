import { and, eq, inArray, type SQL } from 'drizzle-orm';
import type {
  ListingMappingState,
  MappableListingRecord,
} from '@tokoboss/application';
import type { MarketplaceProvider } from '@tokoboss/domain';
import type { DatabaseHandle, Transaction } from '../db';
import {
  catalogVariants,
  marketplaceConnections,
  marketplaceListings,
  type MarketplaceListingRow,
} from '../schema/index';

/**
 * Staged listing reads for the Drizzle SKU mapping read store (UTA-40 /
 * US03, RFC 05 task 22a): listings joined with their connection, plus
 * the suggested variants' SKU codes. Used by 22d overview, 22f store.
 */

type DbOrTx = Transaction | DatabaseHandle;
type JoinedListing = {
  listing: MarketplaceListingRow;
  provider: string;
  providerStoreId: string;
  storeName: string | null;
  status: string;
};

export async function selectMappableListings(
  db: DbOrTx,
  workspaceId: string,
  where?: SQL
): Promise<MappableListingRecord[]> {
  const l = marketplaceListings;
  const c = marketplaceConnections;
  const rows: JoinedListing[] = await db
    .select({
      listing: l,
      provider: c.provider,
      providerStoreId: c.providerStoreId,
      storeName: c.storeName,
      status: c.status,
    })
    .from(l)
    .innerJoin(c, eq(c.id, l.connectionId))
    .where(and(eq(l.workspaceId, workspaceId), where))
    .orderBy(l.connectionId, l.platformSkuId);
  const ids = [...new Set(rows.flatMap((r) => r.listing.suggestedVariantIds))];
  const v = catalogVariants;
  const codes: Array<{ id: string; skuCode: string }> = ids.length
    ? await db
        .select({ id: v.id, skuCode: v.skuCode })
        .from(v)
        .where(and(eq(v.workspaceId, workspaceId), inArray(v.id, ids)))
    : [];
  const skuById = new Map(codes.map((r) => [r.id, r.skuCode]));
  return rows.map(({ listing: row, ...conn }) => ({
    listingId: row.id,
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
    suggestedVariantIds: [...row.suggestedVariantIds],
    lastSeenAt: row.lastSeenAt,
    channel: conn.provider as MarketplaceProvider,
    shopExtId: conn.providerStoreId,
    storeDisplayName: conn.storeName,
    connectionConnected: conn.status === 'connected',
    candidateSkuCodes: row.suggestedVariantIds.flatMap((id) => {
      const code = skuById.get(id);
      return code === undefined ? [] : [code];
    }),
  }));
}

const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();

/** Not-yet-mapped listings in scope; q over Store SKU text / title / id. */
export function openSkuListings(
  listings: MappableListingRecord[],
  input: { q?: string; connectionId?: string }
): MappableListingRecord[] {
  const q = norm(input.q);
  return listings.filter(
    (l) =>
      (!input.connectionId || l.connectionId === input.connectionId) &&
      l.mappingState !== 'mapped' &&
      (!q ||
        [l.storeSkuText, l.title, l.platformSkuId].some((v) =>
          norm(v).includes(q)
        ))
  );
}
