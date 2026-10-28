import { z } from 'zod';

/**
 * Story 18 store health views (UTA-38 / US18, RFC 07 row 4b): health badge
 * (mirrors domain marketplace-connection-health.ts), per-store operational
 * metrics and the 5-step setup checklist (marketplace-connection-checklist).
 * Strict, read-only. Dates are ISO strings.
 */

export const ConnectionHealthBadgeDtoSchema = z
  .object({
    status: z.enum([
      'healthy',
      'paused_partial',
      'paused_full',
      'expiring_soon',
      'degraded',
      'needs_reauth',
      'disconnected',
    ]),
    label: z.string().min(1),
    tone: z.enum(['ok', 'sky', 'warn', 'bad']),
    /** `Token 3 hari lagi`, `Token kedaluwarsa`, or null (no expiry). */
    tokenExpiryLabel: z.string().nullable(),
  })
  .strict();
export type ConnectionHealthBadgeDto = z.infer<
  typeof ConnectionHealthBadgeDtoSchema
>;

const Count = z.number().int().nonnegative();

export const ConnectionOperationalMetricsDtoSchema = z
  .object({
    mappedSkuCount: Count,
    archivedMappedSkuCount: Count,
    conflictSkuCount: Count,
    rateLimitedSkuCount: Count,
    lastStockPushAt: z.string().datetime().nullable(),
    lastOrderImportAt: z.string().datetime().nullable(),
    linkedWarehouseCount: Count,
    linkedWarehouseCodes: z.array(z.string().min(1)),
  })
  .strict();
export type ConnectionOperationalMetricsDto = z.infer<
  typeof ConnectionOperationalMetricsDtoSchema
>;

export const ConnectionSetupChecklistDtoSchema = z.array(
  z
    .object({
      key: z.enum([
        'oauth_connected',
        'warehouse_linked',
        'sku_mapped',
        'stock_sync_active',
        'pickup_and_labels',
      ]),
      state: z.enum([
        'complete',
        'attention',
        'incomplete',
        'paused',
        'supported',
        'manual',
        'unknown',
      ]),
    })
    .strict()
);
export type ConnectionSetupChecklistDto = z.infer<
  typeof ConnectionSetupChecklistDtoSchema
>;
