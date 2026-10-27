import { and, eq, isNull } from 'drizzle-orm';
import {
  skuMappingNotFound,
  suggestListingMatches,
  type ListingMatchStateResult,
} from '@tokoboss/application';
import type { DatabaseHandle, Transaction } from '../db';
import {
  catalogChannelMappings,
  catalogVariants,
  marketplaceConnections,
  marketplaceListings,
} from '../schema/index';

/**
 * Listing match recompute for the Drizzle SKU mapping write store
 * (UTA-40 / US03, RFC 05 task 21b). Mirrors inMemoryRecomputeListing:
 * suggestListingMatches over the listing's whole store (so duplicate
 * Store SKU text still suppresses suggestions), persisted on the row.
 */

type DbOrTx = Transaction | DatabaseHandle;

export async function recomputeSkuListingMatchState(
  db: DbOrTx,
  workspaceId: string,
  listingId: string
): Promise<ListingMatchStateResult> {
  const l = marketplaceListings;
  const c = marketplaceConnections;
  const found = await db
    .select({
      connectionId: l.connectionId,
      platformSkuId: l.platformSkuId,
      provider: c.provider,
      providerStoreId: c.providerStoreId,
    })
    .from(l)
    .innerJoin(c, eq(c.id, l.connectionId))
    .where(and(eq(l.workspaceId, workspaceId), eq(l.id, listingId)))
    .limit(1);
  const target = found[0];
  if (!target) throw skuMappingNotFound('staged listing');

  const m = catalogChannelMappings;
  const v = catalogVariants;
  const [listings, variants, mapped] = await Promise.all([
    db
      .select({
        platformSkuId: l.platformSkuId,
        storeSkuText: l.storeSkuText,
        barcodeHint: l.barcodeHint,
      })
      .from(l)
      .where(
        and(
          eq(l.workspaceId, workspaceId),
          eq(l.connectionId, target.connectionId)
        )
      ),
    db
      .select({ id: v.id, skuCode: v.skuCode, barcode: v.barcode })
      .from(v)
      .where(and(eq(v.workspaceId, workspaceId), eq(v.status, 'active'))),
    db
      .select({ platformSkuId: m.platformSkuId })
      .from(m)
      .where(
        and(
          eq(m.workspaceId, workspaceId),
          eq(m.channel, target.provider),
          eq(m.shopExtId, target.providerStoreId),
          isNull(m.archivedAt)
        )
      ),
  ]);
  const match = suggestListingMatches({
    listings,
    variants,
    mappedPlatformSkuIds: new Set(
      mapped.map((r: { platformSkuId: string }) => r.platformSkuId)
    ),
  }).find((x) => x.platformSkuId === target.platformSkuId);
  const mappingState = match?.mappingState ?? 'unmapped';
  const suggestedVariantIds = match?.suggestedVariantIds ?? [];
  await db
    .update(l)
    .set({ mappingState, suggestedVariantIds, updatedAt: new Date() })
    .where(and(eq(l.workspaceId, workspaceId), eq(l.id, listingId)));
  return { mappingState, suggestedVariantIds: [...suggestedVariantIds] };
}
