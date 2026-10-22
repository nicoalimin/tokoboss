import { z } from 'zod';
import { InitialImportStatusSchema } from './integrations';

/**
 * Marketplace integration listing wire contracts (UTA-39 / US20, RFC 04
 * task 80c): staged listing rows, the PII-free order preview, the import
 * summary and the listings page / query. Mirrors integration-types.ts.
 * Views are strict: no secrets, no buyer name, address or phone.
 */

export const IntegrationListingMappingStateSchema = z.enum([
  'unmapped',
  'suggested',
  'ambiguous',
  'mapped',
  'ignored',
]);
export type IntegrationListingMappingState = z.infer<
  typeof IntegrationListingMappingStateSchema
>;

/** One staged Store SKU row in the import review list. */
export const IntegrationListingRowViewSchema = z
  .object({
    connectionId: z.string().min(1),
    externalItemId: z.string().min(1),
    platformSkuId: z.string().min(1),
    storeSkuText: z.string().nullable(),
    barcodeHint: z.string().nullable(),
    title: z.string().nullable(),
    variantName: z.string().nullable(),
    listingStatus: z.string().nullable(),
    providerStock: z.number().int().nullable(),
    mappingState: IntegrationListingMappingStateSchema,
    suggestedVariantIds: z.array(z.string().min(1)),
    lastSeenAt: z.string().datetime(),
  })
  .strict();
export type IntegrationListingRowView = z.infer<
  typeof IntegrationListingRowViewSchema
>;

/** GET .../listings query (Admin/Manager): mapping_state filter, cursor. */
export const IntegrationListingsQuerySchema = z
  .object({
    mappingState: IntegrationListingMappingStateSchema.optional(),
    cursor: z.string().min(1).optional(),
  })
  .strict();
export type IntegrationListingsQuery = z.infer<
  typeof IntegrationListingsQuerySchema
>;

/** GET .../listings response; nextCursor null on the last page. */
export const IntegrationListingsPageSchema = z
  .object({
    listings: z.array(IntegrationListingRowViewSchema),
    nextCursor: z.string().min(1).nullable(),
  })
  .strict();
export type IntegrationListingsPage = z.infer<
  typeof IntegrationListingsPageSchema
>;

/** PII-free recent order (max 50 from the last 7 days per connection). */
export const IntegrationOrderPreviewViewSchema = z
  .object({
    connectionId: z.string().min(1),
    externalOrderId: z.string().min(1),
    providerStatus: z.string().nullable(),
    orderedAt: z.string().datetime().nullable(),
    lineCount: z.number().int().nonnegative(),
    totalCents: z.number().int().nullable(),
  })
  .strict();
export type IntegrationOrderPreviewView = z.infer<
  typeof IntegrationOrderPreviewViewSchema
>;

/** GET .../orders response (Admin/Manager). */
export const IntegrationOrderPreviewListSchema = z
  .object({ orders: z.array(IntegrationOrderPreviewViewSchema).max(50) })
  .strict();
export type IntegrationOrderPreviewList = z.infer<
  typeof IntegrationOrderPreviewListSchema
>;

/** Counts for the initial-import success screen. */
export const IntegrationImportSummarySchema = z
  .object({
    connectionId: z.string().min(1),
    status: InitialImportStatusSchema,
    listingsImported: z.number().int().nonnegative(),
    storeSkusMapped: z.number().int().nonnegative(),
    ordersImported: z.number().int().nonnegative(),
    locationsFound: z.number().int().nonnegative(),
    inventorySyncEnabled: z.boolean(),
    completedAt: z.string().datetime().nullable(),
  })
  .strict();
export type IntegrationImportSummary = z.infer<
  typeof IntegrationImportSummarySchema
>;
