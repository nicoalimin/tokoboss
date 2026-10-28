import { z } from 'zod';
import { SkuMappingChannelSchema } from './sku-mappings';

/**
 * Story 04 outbound inventory sync wire contracts (UTA-37 / US04, RFC 06
 * task 18): per-mapping sync settings, manual sync / retry triggers, the
 * per-mapping sync state view and the calm needs_attention alert item.
 * Strict: no tokens, no buyer PII. Dates are ISO strings.
 */

export const InventorySyncStatusSchema = z.enum([
  'off',
  'syncing',
  'synced',
  'needs_attention',
]);
export type InventorySyncStatus = z.infer<typeof InventorySyncStatusSchema>;

export const InventorySyncRemediationSchema = z.enum([
  'reauth_store',
  'link_warehouse',
  'check_listing',
  'retry_now',
]);
export type InventorySyncRemediation = z.infer<
  typeof InventorySyncRemediationSchema
>;

/** PATCH .../sku-mappings/:mappingId/sync (Admin/Manager). */
export const UpdateMappingSyncSettingsInputSchema = z
  .object({
    syncEnabled: z.boolean().optional(),
    stockBuffer: z.number().int().min(0).max(100000).optional(),
    allocationPct: z.number().int().min(1).max(100).optional(),
    syncNow: z.boolean().default(false),
  })
  .strict();
export type UpdateMappingSyncSettingsInput = z.infer<
  typeof UpdateMappingSyncSettingsInputSchema
>;

/** POST .../inventory-sync manual sync / retry (Admin/Manager); one scope. */
export const TriggerInventorySyncInputSchema = z
  .object({
    mappingId: z.string().uuid().optional(),
    variantId: z.string().uuid().optional(),
    connectionId: z.string().uuid().optional(),
  })
  .strict()
  .refine((b) => !!(b.mappingId || b.variantId || b.connectionId), {
    message: 'mappingId, variantId or connectionId is required',
  });
export type TriggerInventorySyncInput = z.infer<
  typeof TriggerInventorySyncInputSchema
>;

/** Sync state for one mapped Store SKU (defaults when no state row yet). */
export const MappingSyncStateViewSchema = z
  .object({
    mappingId: z.string().min(1),
    variantId: z.string().min(1),
    connectionId: z.string().min(1).nullable(),
    syncEnabled: z.boolean(),
    stockBuffer: z.number().int().nonnegative(),
    allocationPct: z.number().int().min(1).max(100),
    syncStatus: InventorySyncStatusSchema,
    desiredQty: z.number().int().nullable(),
    lastPushedQty: z.number().int().nullable(),
    lastSyncedAt: z.string().datetime().nullable(),
    lastErrorCode: z.string().nullable(),
    lastErrorMessage: z.string().nullable(),
    version: z.number().int().positive(),
  })
  .strict();
export type MappingSyncStateView = z.infer<typeof MappingSyncStateViewSchema>;

/** One calm Perlu tindakan alert: SKU, Store SKU, store, reason, action. */
export const InventorySyncAttentionItemSchema = z
  .object({
    mappingId: z.string().min(1),
    variantId: z.string().min(1),
    skuCode: z.string().min(1),
    storeSkuText: z.string().nullable(),
    platformSkuId: z.string().min(1),
    channel: SkuMappingChannelSchema,
    storeDisplayName: z.string().nullable(),
    errorCode: z.string().min(1),
    reason: z.string().min(1),
    remediation: InventorySyncRemediationSchema,
    updatedAt: z.string().datetime(),
  })
  .strict();
export type InventorySyncAttentionItem = z.infer<
  typeof InventorySyncAttentionItemSchema
>;
