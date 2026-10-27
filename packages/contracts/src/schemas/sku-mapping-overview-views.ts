import { z } from 'zod';
import {
  MarketplaceConnectionStatusSchema,
  MarketplaceProviderSchema,
} from './integrations';
import { CatalogStatusSchema } from './catalog';
import {
  StagedListingCandidateViewSchema,
  SubordinateStoreSkuViewSchema,
} from './sku-mapping-views';

/**
 * Story 03 SKU mapping overview wire views (UTA-40 / US03, RFC 05 task
 * 6b): SKU TokoBoss card, store slot and the overview response. Strict.
 */

export const SkuMappingReviewStateSchema = z.enum([
  'complete',
  'needs_review',
  'unmapped',
  'conflict',
  'issue',
]);
export type SkuMappingReviewState = z.infer<typeof SkuMappingReviewStateSchema>;

/** One canonical SKU TokoBoss card on the Petakan Store SKU screen. */
export const TokobossSkuMappingCardViewSchema = z
  .object({
    variantId: z.string().min(1),
    productId: z.string().min(1),
    skuCode: z.string().min(1),
    productName: z.string(),
    variantName: z.string().nullable(),
    barcode: z.string().nullable(),
    status: CatalogStatusSchema,
    totalStockQty: z.number().int(),
    reviewState: SkuMappingReviewStateSchema,
    mappings: z.array(SubordinateStoreSkuViewSchema),
    suggestions: z.array(StagedListingCandidateViewSchema),
  })
  .strict();
export type TokobossSkuMappingCardView = z.infer<
  typeof TokobossSkuMappingCardViewSchema
>;

/** A connected store slot (column) on the Petakan Store SKU screen. */
export const ConnectedStoreSlotViewSchema = z
  .object({
    connectionId: z.string().min(1),
    provider: MarketplaceProviderSchema,
    providerStoreId: z.string().min(1),
    displayName: z.string().nullable(),
    status: MarketplaceConnectionStatusSchema,
  })
  .strict();
export type ConnectedStoreSlotView = z.infer<
  typeof ConnectedStoreSlotViewSchema
>;

const count = z.number().int().nonnegative();

/** GET /api/workspaces/:workspaceId/sku-mappings response. */
export const SkuMappingOverviewResponseSchema = z
  .object({
    summary: z
      .object({
        mappedStoreSkusCount: count,
        needsReviewCount: count,
        unmappedStoreSkusCount: count,
        unmappedTokobossSkusCount: count,
        stockConflictCount: count,
      })
      .strict(),
    stores: z.array(ConnectedStoreSlotViewSchema),
    items: z.array(TokobossSkuMappingCardViewSchema),
    unassignedListings: z.array(StagedListingCandidateViewSchema),
  })
  .strict();
export type SkuMappingOverviewResponse = z.infer<
  typeof SkuMappingOverviewResponseSchema
>;
