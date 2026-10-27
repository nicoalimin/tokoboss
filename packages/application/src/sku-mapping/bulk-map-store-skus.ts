import { assertTenancyPayloadSafe } from '../tenancy/tenancy-safety';
import type { WorkspaceContext } from '../tenancy/tenancy-types';
import {
  buildBulkMapAudit,
  loadBulkTargets,
  type BulkMapStoreSkusInput,
} from './bulk-map-store-skus-guards';
import { assertSkuMappingWrite } from './map-store-sku-guards';
import {
  buildMappingEvent,
  buildUpsertInput,
  storeSkuKeyOf,
} from './map-store-sku-writes';
import { skuMappingAmbiguousRequiresReview } from './sku-mapping-errors';
import type { SkuMappingDeps } from './sku-mapping-ports';
import type { SkuMappingRecord } from './sku-mapping-types';

export interface BulkMapStoreSkusResult {
  mappedCount: number;
  mappings: SkuMappingRecord[];
}

/**
 * Petakan otomatis saran tunggal (UTA-40 / US03, RFC 05 task 14b).
 * Admin/Manager only. Every item must be a single 'suggested' match for
 * its variant, else 422 SKU_MAPPING_AMBIGUOUS_REQUIRES_REVIEW and nothing
 * is written. Mappings, listing state and 'bulk_mapped' history commit in
 * one transaction; one sku_mapping.bulk_mapped audit row after commit.
 */
export async function bulkMapStoreSkus(
  deps: SkuMappingDeps,
  ctx: WorkspaceContext | null,
  input: BulkMapStoreSkusInput
): Promise<BulkMapStoreSkusResult> {
  assertSkuMappingWrite(ctx, input.workspaceId);
  const { workspaceId, correlationId } = input;
  const targets = await loadBulkTargets(deps.reads, input);
  const actor = { actorId: ctx.userId, source: 'suggested_bulk' as const };

  const mappings = await deps.tx.run(async (store) => {
    const out: SkuMappingRecord[] = [];
    const raced: string[] = [];
    for (const { listing, variantId } of targets) {
      const key = storeSkuKeyOf(workspaceId, listing);
      // A live row appeared since the listing was read: needs review.
      if (await store.findMappingByStoreSku(key)) {
        raced.push(listing.platformSkuId);
        continue;
      }
      const upsert = buildUpsertInput(key, listing, variantId, ctx.userId);
      const { mapping } = await store.upsertMapping(upsert);
      await store.setListingMapped(workspaceId, listing.listingId);
      const event = buildMappingEvent(
        mapping,
        listing,
        'bulk_mapped',
        null,
        actor,
        correlationId
      );
      await store.appendHistoryEvent(event);
      out.push(mapping);
    }
    // Throwing inside run rolls the whole batch back.
    if (raced.length > 0) throw skuMappingAmbiguousRequiresReview(raced);
    return out;
  });

  const audit = buildBulkMapAudit(ctx, targets, mappings, correlationId);
  assertTenancyPayloadSafe(audit.payload, 'sku_mapping');
  await deps.audit.append(audit);
  return { mappedCount: mappings.length, mappings };
}
