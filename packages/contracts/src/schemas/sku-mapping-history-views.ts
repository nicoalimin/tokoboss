import { z } from 'zod';
import {
  SkuMappingActionSchema,
  SkuMappingChannelSchema,
  SkuMappingSourceSchema,
} from './sku-mappings';

/**
 * Story 03 SKU mapping history wire views (UTA-40 / US03, RFC 05 task 6c).
 * Mirrors catalog_channel_mapping_events. Strict; the actor is shown by
 * display name (fallback "Anggota tim"), never by email.
 */

/** One mapping history row (who changed what, when). */
export const SkuMappingHistoryEventViewSchema = z
  .object({
    id: z.string().min(1),
    action: SkuMappingActionSchema,
    source: SkuMappingSourceSchema,
    variantId: z.string().min(1),
    skuCode: z.string().nullable(),
    previousVariantId: z.string().min(1).nullable(),
    previousSkuCode: z.string().nullable(),
    channel: SkuMappingChannelSchema,
    shopExtId: z.string().min(1),
    storeDisplayName: z.string().nullable(),
    externalItemId: z.string().nullable(),
    platformSkuId: z.string().min(1),
    storeSkuText: z.string().nullable(),
    listingTitle: z.string().nullable(),
    variantName: z.string().nullable(),
    actorId: z.string().min(1),
    actorDisplayName: z.string().min(1),
    createdAt: z.string().datetime(),
  })
  .strict();
export type SkuMappingHistoryEventView = z.infer<
  typeof SkuMappingHistoryEventViewSchema
>;

/** GET /api/workspaces/:workspaceId/sku-mappings/history response. */
export const SkuMappingHistoryResponseSchema = z
  .object({ events: z.array(SkuMappingHistoryEventViewSchema).max(100) })
  .strict();
export type SkuMappingHistoryResponse = z.infer<
  typeof SkuMappingHistoryResponseSchema
>;
