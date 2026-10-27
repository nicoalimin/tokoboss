import {
  isMarketplaceProvider,
  type MarketplaceProvider,
} from '@tokoboss/domain';
import {
  SKU_MAPPING_ACTIONS,
  SKU_MAPPING_SOURCES,
  type SkuMappingAction,
  type SkuMappingEventRecord,
  type SkuMappingRecord,
  type SkuMappingSource,
} from '@tokoboss/application';
import type {
  CatalogChannelMappingEventRow,
  CatalogChannelMappingRow,
} from '../schema/index';

/**
 * Row → record mappers for `catalog_channel_mappings` and
 * `catalog_channel_mapping_events` (UTA-40 / US03, RFC 05 task 20a).
 * Used by the Drizzle SKU mapping write/read stores (rows 21–22);
 * the joined history entry mapper is drizzle-sku-mapping-history-mapper.ts.
 * Unknown enum text throws instead of leaking an invalid record.
 */

function oneOf<T extends string>(
  label: string,
  allowed: readonly string[],
  value: string
): T {
  if (!allowed.includes(value)) {
    throw new Error(`SKU_MAPPING_CORRUPT: unknown ${label} ${value}`);
  }
  return value as T;
}

function asSkuMappingChannel(value: string): MarketplaceProvider {
  if (!isMarketplaceProvider(value)) {
    throw new Error(`SKU_MAPPING_CORRUPT: unknown channel ${value}`);
  }
  return value;
}

export function toSkuMappingRecord(
  row: CatalogChannelMappingRow
): SkuMappingRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    variantId: row.variantId,
    connectionId: row.connectionId,
    channel: row.channel,
    shopExtId: row.shopExtId,
    externalItemId: row.externalItemId,
    platformSkuId: row.platformSkuId,
    sellerSkuHint: row.sellerSkuHint,
    barcodeHint: row.barcodeHint,
    listingName: row.listingName,
    variantName: row.variantName,
    mappedBy: row.mappedBy,
    version: row.version,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toSkuMappingEventRecord(
  row: CatalogChannelMappingEventRow
): SkuMappingEventRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    mappingId: row.mappingId,
    variantId: row.variantId,
    previousVariantId: row.previousVariantId,
    connectionId: row.connectionId,
    channel: asSkuMappingChannel(row.channel),
    shopExtId: row.shopExtId,
    externalItemId: row.externalItemId,
    platformSkuId: row.platformSkuId,
    storeSkuText: row.storeSkuText,
    listingTitle: row.listingTitle,
    variantName: row.variantName,
    action: oneOf<SkuMappingAction>('action', SKU_MAPPING_ACTIONS, row.action),
    source: oneOf<SkuMappingSource>('source', SKU_MAPPING_SOURCES, row.source),
    actorId: row.actorId,
    correlationId: row.correlationId,
    createdAt: row.createdAt,
  };
}
