import type { MarketplaceProvider } from '@tokoboss/domain';

/**
 * Story 03 SKU mapping records (UTA-40 / US03, RFC 05 task 8a).
 *
 * Plain records exchanged between the sku-mapping use cases and their
 * stores. SKU TokoBoss (catalog_variants) is canonical; Store SKU text,
 * listing title and option name are hints only. Overview read models:
 * sku-mapping-overview-types.ts (8b). Wire views: contracts.
 */

export const SKU_MAPPING_ACTIONS = [
  'mapped',
  'remapped',
  'unmapped',
  'bulk_mapped',
  'restored',
] as const;
export type SkuMappingAction = (typeof SKU_MAPPING_ACTIONS)[number];

export const SKU_MAPPING_SOURCES = [
  'manual',
  'suggested_single',
  'suggested_bulk',
] as const;
export type SkuMappingSource = (typeof SKU_MAPPING_SOURCES)[number];

/** One catalog_channel_mappings row (channel is legacy free text). */
export interface SkuMappingRecord {
  id: string;
  workspaceId: string;
  variantId: string;
  connectionId: string | null;
  channel: string;
  shopExtId: string;
  externalItemId: string | null;
  platformSkuId: string;
  sellerSkuHint: string | null;
  barcodeHint: string | null;
  listingName: string | null;
  variantName: string | null;
  mappedBy: string | null;
  version: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** One append-only catalog_channel_mapping_events row (AC5). */
export interface SkuMappingEventRecord {
  id: string;
  workspaceId: string;
  mappingId: string | null;
  variantId: string;
  previousVariantId: string | null;
  connectionId: string | null;
  channel: MarketplaceProvider;
  shopExtId: string;
  externalItemId: string | null;
  platformSkuId: string;
  storeSkuText: string | null;
  listingTitle: string | null;
  variantName: string | null;
  action: SkuMappingAction;
  source: SkuMappingSource;
  actorId: string;
  correlationId: string | null;
  createdAt: Date;
}

/** History row joined with SKU codes, store name and actor display name. */
export interface SkuMappingHistoryEntry extends SkuMappingEventRecord {
  skuCode: string | null;
  previousSkuCode: string | null;
  storeDisplayName: string | null;
  /** user_profiles.display_name, else "Anggota tim"; never an email. */
  actorDisplayName: string;
}
