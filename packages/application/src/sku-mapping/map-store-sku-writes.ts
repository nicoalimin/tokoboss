import type {
  AppendSkuMappingEventInput,
  MappableListingRecord,
  StoreSkuKey,
  UpsertSkuMappingInput,
} from './sku-mapping-port-inputs';
import type { SkuMappingAction, SkuMappingRecord } from './sku-mapping-types';

/**
 * Write builders for mapStoreSku (UTA-40 / US03, RFC 05 task 13b): the
 * natural Store SKU key, the upsert payload and the history event.
 */

/** (workspace, channel, shop_ext_id, platform_sku_id) of a listing. */
export function storeSkuKeyOf(
  workspaceId: string,
  listing: MappableListingRecord
): StoreSkuKey {
  const { channel, shopExtId, platformSkuId } = listing;
  return { workspaceId, channel, shopExtId, platformSkuId };
}

/** Upsert payload; listing title/option/store SKU text are hints only. */
export function buildUpsertInput(
  key: StoreSkuKey,
  listing: MappableListingRecord,
  variantId: string,
  mappedBy: string,
  expectedVersion?: number
): UpsertSkuMappingInput {
  return {
    ...key,
    variantId,
    connectionId: listing.connectionId,
    externalItemId: listing.externalItemId,
    sellerSkuHint: listing.storeSkuText,
    barcodeHint: listing.barcodeHint,
    listingName: listing.title,
    variantName: listing.variantName,
    mappedBy,
    expectedVersion,
  };
}

/** Append-only history row for a map / remap / restore. */
export function buildMappingEvent(
  mapping: SkuMappingRecord,
  listing: MappableListingRecord,
  action: SkuMappingAction,
  previousVariantId: string | null,
  ctx: { actorId: string; source: 'manual' | 'suggested_single' },
  correlationId?: string
): AppendSkuMappingEventInput {
  return {
    workspaceId: mapping.workspaceId,
    mappingId: mapping.id,
    variantId: mapping.variantId,
    previousVariantId,
    connectionId: listing.connectionId,
    channel: listing.channel,
    shopExtId: listing.shopExtId,
    externalItemId: listing.externalItemId,
    platformSkuId: listing.platformSkuId,
    storeSkuText: listing.storeSkuText,
    listingTitle: listing.title,
    variantName: listing.variantName,
    action,
    source: ctx.source,
    actorId: ctx.actorId,
    correlationId: correlationId ?? null,
  };
}

/** audit_events row for a map/restore (mapped) or remap; opaque ids only. */
export function buildMapAudit(
  outcome: 'mapped' | 'remapped' | 'restored',
  mapping: SkuMappingRecord,
  listing: MappableListingRecord,
  previousVariantId: string | null,
  source: 'manual' | 'suggested_single'
): { action: string; payload: Record<string, unknown> } {
  const { connectionId, channel, platformSkuId } = listing;
  const ids = { mappingId: mapping.id, variantId: mapping.variantId };
  if (outcome === 'remapped') {
    return {
      action: 'sku_mapping.remapped',
      payload: {
        ...ids,
        previousVariantId,
        connectionId,
        channel,
        platformSkuId,
      },
    };
  }
  return {
    action: 'sku_mapping.mapped',
    payload: { ...ids, connectionId, channel, platformSkuId, source },
  };
}
