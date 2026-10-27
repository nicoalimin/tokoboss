import type { WorkspaceContext } from '../tenancy/tenancy-types';
import { loadMapTargets } from './map-store-sku-guards';
import {
  skuMappingAmbiguousRequiresReview,
  skuMappingValidation,
} from './sku-mapping-errors';
import type { MappableListingRecord } from './sku-mapping-port-inputs';
import type { SkuMappingReadStore } from './sku-mapping-ports';
import type { SkuMappingRecord } from './sku-mapping-types';

/**
 * Input, batch guards and summary audit for bulkMapStoreSkus (UTA-40 /
 * US03, RFC 05 task 14a). Use case: bulk-map-store-skus.ts (14b).
 */

export interface BulkMapStoreSkusInput {
  workspaceId: string;
  /** 1..200 items (BulkMapStoreSkusBodySchema). */
  items: Array<{ listingId: string; variantId: string }>;
  correlationId?: string;
}

export interface BulkMapTarget {
  listing: MappableListingRecord;
  variantId: string;
}

/** Only 'suggested' with exactly [variantId] may be bulk-mapped (AC4). */
export function isSingleSuggestion(
  listing: MappableListingRecord,
  variantId: string
): boolean {
  const ids = listing.suggestedVariantIds;
  return (
    listing.mappingState === 'suggested' &&
    ids.length === 1 &&
    ids[0] === variantId
  );
}

/**
 * Loads every item (404 / 422 archived / 400 disconnected via 13a), then
 * rejects the whole batch with 422 SKU_MAPPING_AMBIGUOUS_REQUIRES_REVIEW
 * listing each ambiguous, mapped or mismatched platformSkuId.
 */
export async function loadBulkTargets(
  reads: Pick<SkuMappingReadStore, 'findVariant' | 'findListing'>,
  input: Pick<BulkMapStoreSkusInput, 'workspaceId' | 'items'>
): Promise<BulkMapTarget[]> {
  const { workspaceId, items } = input;
  if (new Set(items.map((i) => i.listingId)).size !== items.length) {
    throw skuMappingValidation('duplicate listingId in batch');
  }
  const targets: BulkMapTarget[] = [];
  for (const { listingId, variantId } of items) {
    const ids = { workspaceId, listingId, variantId };
    const { listing } = await loadMapTargets(reads, ids);
    targets.push({ listing, variantId });
  }
  const offending = targets
    .filter((t) => !isSingleSuggestion(t.listing, t.variantId))
    .map((t) => t.listing.platformSkuId);
  if (offending.length > 0) throw skuMappingAmbiguousRequiresReview(offending);
  return targets;
}

/** One summary audit_events row; opaque ids only. */
export function buildBulkMapAudit(
  ctx: WorkspaceContext,
  targets: BulkMapTarget[],
  mappings: SkuMappingRecord[],
  correlationId?: string
) {
  const connectionIds = [
    ...new Set(targets.map((t) => t.listing.connectionId)),
  ];
  return {
    workspaceId: ctx.workspaceId,
    category: 'workspace' as const,
    actorId: ctx.userId,
    correlationId,
    action: 'sku_mapping.bulk_mapped',
    payload: {
      count: mappings.length,
      mappingIds: mappings.map((m) => m.id),
      connectionIds,
    },
  };
}
