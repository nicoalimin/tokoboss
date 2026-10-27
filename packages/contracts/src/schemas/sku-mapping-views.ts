import { z } from 'zod';
import { IntegrationListingMappingStateSchema } from './integration-listings';
import { SkuMappingChannelSchema } from './sku-mappings';

/**
 * Story 03 SKU mapping wire views (UTA-40 / US03, RFC 05 task 6a): one
 * mapped Store SKU under a SKU TokoBoss and a staged candidate listing.
 * Strict: no secrets, no buyer PII. Dates are ISO strings.
 */

export const SkuMappingStockScopeSchema = z.enum([
  'linked_warehouses',
  'all_active_warehouses',
]);
export type SkuMappingStockScope = z.infer<typeof SkuMappingStockScopeSchema>;

export const SkuMappingLifecycleIssueSchema = z.enum([
  'listing_missing',
  'listing_deleted',
  'listing_paused',
  'listing_inactive',
  'connection_disconnected',
  'title_renamed',
]);
export type SkuMappingLifecycleIssue = z.infer<
  typeof SkuMappingLifecycleIssueSchema
>;

/** One mapped Store SKU beneath a SKU TokoBoss, with conflict/drift flags. */
export const SubordinateStoreSkuViewSchema = z
  .object({
    mappingId: z.string().min(1),
    variantId: z.string().min(1),
    connectionId: z.string().min(1).nullable(),
    storeDisplayName: z.string().nullable(),
    channel: z.string().min(1),
    shopExtId: z.string().min(1),
    externalItemId: z.string().nullable(),
    platformSkuId: z.string().min(1),
    storeSkuText: z.string().nullable(),
    listingTitle: z.string().nullable(),
    variantName: z.string().nullable(),
    listingStatus: z.string().nullable(),
    providerStock: z.number().int().nullable(),
    tokobossStockQty: z.number().int(),
    stockScope: SkuMappingStockScopeSchema,
    hasStockConflict: z.boolean(),
    stockDelta: z.number().int().nullable(),
    lifecycleIssue: SkuMappingLifecycleIssueSchema.nullable(),
    version: z.number().int().positive(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type SubordinateStoreSkuView = z.infer<
  typeof SubordinateStoreSkuViewSchema
>;

/** A staged, not-yet-mapped listing (suggestion or unassigned pick). */
export const StagedListingCandidateViewSchema = z
  .object({
    listingId: z.string().min(1),
    connectionId: z.string().min(1),
    storeDisplayName: z.string().nullable(),
    channel: SkuMappingChannelSchema,
    externalItemId: z.string().min(1),
    platformSkuId: z.string().min(1),
    storeSkuText: z.string().nullable(),
    title: z.string().nullable(),
    variantName: z.string().nullable(),
    listingStatus: z.string().nullable(),
    providerStock: z.number().int().nullable(),
    mappingState: IntegrationListingMappingStateSchema,
    suggestedVariantIds: z.array(z.string().min(1)),
    candidateSkuCodes: z.array(z.string().min(1)),
  })
  .strict();
export type StagedListingCandidateView = z.infer<
  typeof StagedListingCandidateViewSchema
>;
