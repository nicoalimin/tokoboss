import { isMarketplaceProvider } from '@tokoboss/domain';
import type { ListingMappingState } from '../integrations/integration-types';
import { assertTenancyPayloadSafe } from '../tenancy/tenancy-safety';
import type { WorkspaceContext } from '../tenancy/tenancy-types';
import { assertSkuMappingWrite } from './map-store-sku-guards';
import { skuMappingNotFound, skuMappingValidation } from './sku-mapping-errors';
import type { SkuMappingDeps } from './sku-mapping-ports';
import type { SkuMappingRecord } from './sku-mapping-types';

export interface UnmapStoreSkuInput {
  workspaceId: string;
  mappingId: string;
  correlationId?: string;
}

export interface UnmapStoreSkuResult {
  deleted: true;
  mapping: SkuMappingRecord;
  /** Listing state after suggestListingMatches; null if no staged row. */
  recomputedMappingState: ListingMappingState | null;
}

/**
 * Lepas pemetaan Store SKU (UTA-40 / US03, RFC 05 task 15). Admin/Manager
 * only. Archives the live mapping (absent/archived → 404), recomputes the
 * staged listing's mapping_state + suggested_variant_ids and appends an
 * 'unmapped' history row in one transaction; sku_mapping.unmapped audit
 * after commit. History keeps the unmapped variantId and the mapping id.
 */
export async function unmapStoreSku(
  deps: SkuMappingDeps,
  ctx: WorkspaceContext | null,
  input: UnmapStoreSkuInput
): Promise<UnmapStoreSkuResult> {
  assertSkuMappingWrite(ctx, input.workspaceId);
  const { workspaceId, mappingId, correlationId } = input;
  const entry = await deps.reads.findMapping(workspaceId, mappingId);
  if (!entry || entry.mapping.archivedAt) throw skuMappingNotFound();
  const { mapping, listing } = entry;
  const channel = listing?.channel ?? mapping.channel;
  if (!isMarketplaceProvider(channel)) {
    throw skuMappingValidation('legacy channel mapping cannot be unmapped');
  }

  const recomputed = await deps.tx.run(async (store) => {
    // Row-level re-check: a concurrent unmap already archived it → 404.
    const archived = await store.deleteMapping(workspaceId, mappingId);
    if (!archived) throw skuMappingNotFound();
    const state = listing
      ? await store.recomputeListingMatchState(workspaceId, listing.listingId)
      : null;
    await store.appendHistoryEvent({
      workspaceId,
      mappingId: mapping.id,
      variantId: mapping.variantId,
      previousVariantId: null,
      connectionId: mapping.connectionId,
      channel,
      shopExtId: mapping.shopExtId,
      externalItemId: mapping.externalItemId,
      platformSkuId: mapping.platformSkuId,
      storeSkuText: mapping.sellerSkuHint,
      listingTitle: mapping.listingName,
      variantName: mapping.variantName,
      action: 'unmapped',
      source: 'manual',
      actorId: ctx.userId,
      correlationId: correlationId ?? null,
    });
    return state;
  });

  const payload = {
    mappingId: mapping.id,
    variantId: mapping.variantId,
    connectionId: mapping.connectionId,
    channel,
    platformSkuId: mapping.platformSkuId,
  };
  assertTenancyPayloadSafe(payload, 'sku_mapping');
  await deps.audit.append({
    workspaceId,
    category: 'workspace',
    actorId: ctx.userId,
    correlationId,
    action: 'sku_mapping.unmapped',
    payload,
  });
  const recomputedMappingState = recomputed?.mappingState ?? null;
  return { deleted: true, mapping, recomputedMappingState };
}
