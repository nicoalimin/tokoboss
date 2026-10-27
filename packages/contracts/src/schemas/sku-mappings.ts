import { z } from 'zod';

/**
 * Story 03 SKU mapping request / query wire contracts (UTA-40 / US03,
 * RFC 05 task 5). View shapes live in sku-mapping-views.ts (task 6).
 */

export const SkuMappingChannelSchema = z.enum([
  'shopee',
  'tiktok_shop',
  'blibli',
]);
export type SkuMappingChannel = z.infer<typeof SkuMappingChannelSchema>;

export const SkuMappingActionSchema = z.enum([
  'mapped',
  'remapped',
  'unmapped',
  'bulk_mapped',
  'restored',
]);
export type SkuMappingAction = z.infer<typeof SkuMappingActionSchema>;

export const SkuMappingSourceSchema = z.enum([
  'manual',
  'suggested_single',
  'suggested_bulk',
]);
export type SkuMappingSource = z.infer<typeof SkuMappingSourceSchema>;

export const SkuMappingOverviewFilterSchema = z.enum([
  'all',
  'unmapped_sku',
  'needs_review',
  'conflict',
  'issue',
]);
export type SkuMappingOverviewFilter = z.infer<
  typeof SkuMappingOverviewFilterSchema
>;

/** GET /api/workspaces/:workspaceId/sku-mappings query (any member). */
export const SkuMappingOverviewQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    filter: SkuMappingOverviewFilterSchema.optional(),
    connectionId: z.string().min(1).max(200).optional(),
    variantId: z.string().min(1).max(200).optional(),
  })
  .strict();
export type SkuMappingOverviewQuery = z.infer<
  typeof SkuMappingOverviewQuerySchema
>;

/**
 * POST /api/workspaces/:workspaceId/sku-mappings (Admin/Manager).
 * Remapping an already-mapped listing needs allowRemap + expectedVersion.
 */
export const MapStoreSkuBodySchema = z
  .object({
    variantId: z.string().uuid(),
    listingId: z.string().uuid(),
    source: z.enum(['manual', 'suggested_single']).default('manual'),
    allowRemap: z.boolean().default(false),
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict()
  .refine((b) => !b.allowRemap || b.expectedVersion !== undefined, {
    message: 'expectedVersion is required when allowRemap is true',
    path: ['expectedVersion'],
  });
export type MapStoreSkuBody = z.infer<typeof MapStoreSkuBodySchema>;

/** POST /api/workspaces/:workspaceId/sku-mappings/bulk (Admin/Manager). */
export const BulkMapStoreSkusBodySchema = z
  .object({
    items: z
      .array(
        z.object({
          listingId: z.string().uuid(),
          variantId: z.string().uuid(),
        })
      )
      .min(1)
      .max(200),
  })
  .strict();
export type BulkMapStoreSkusBody = z.infer<typeof BulkMapStoreSkusBodySchema>;

/** GET /api/workspaces/:workspaceId/sku-mappings/history query. */
export const SkuMappingHistoryQuerySchema = z
  .object({
    variantId: z.string().min(1).max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type SkuMappingHistoryQuery = z.infer<
  typeof SkuMappingHistoryQuerySchema
>;
