import { z } from 'zod';
import { MarketplaceProviderSchema } from './integrations';

/**
 * Story 18 Manage Marketplace Integrations request contracts (UTA-38 /
 * US18, RFC 07 row 4a): store-level controls, typed PUTUSKAN disconnect
 * and the integration activity feed. Health/metrics/checklist views are
 * in integration-health-views.ts (row 4b). Strict: no tokens, no buyer PII.
 */

/** PATCH .../integrations/:connectionId/controls (Admin only). */
export const UpdateConnectionControlsBodySchema = z
  .object({
    orderImportEnabled: z.boolean().optional(),
    inventorySyncEnabled: z.boolean().optional(),
    reconcileNow: z.boolean().optional(),
  })
  .strict()
  .refine(
    (b) =>
      b.orderImportEnabled !== undefined ||
      b.inventorySyncEnabled !== undefined ||
      b.reconcileNow !== undefined,
    {
      message:
        'Provide orderImportEnabled, inventorySyncEnabled or reconcileNow',
    }
  );
export type UpdateConnectionControlsBody = z.infer<
  typeof UpdateConnectionControlsBodySchema
>;

/** DELETE .../integrations/:connectionId (Putuskan; body optional). */
export const DisconnectConnectionBodySchema = z
  .object({ confirmationText: z.literal('PUTUSKAN').optional() })
  .strict();
export type DisconnectConnectionBody = z.infer<
  typeof DisconnectConnectionBodySchema
>;

export const IntegrationActivityActionSchema = z.enum([
  'integration.connected',
  'integration.reauthorized',
  'integration.controls_updated',
  'integration.token_refresh_failed',
  'integration.ownership_conflict',
  'integration.disconnected',
  'integration.removed',
  'integration.location_linked',
]);
export type IntegrationActivityAction = z.infer<
  typeof IntegrationActivityActionSchema
>;

/** One audit_events row on the activity feed; times rendered in WIB. */
export const IntegrationActivityItemDtoSchema = z
  .object({
    id: z.string().min(1),
    action: IntegrationActivityActionSchema,
    connectionId: z.string().min(1).nullable(),
    provider: MarketplaceProviderSchema.nullable(),
    storeName: z.string().nullable(),
    actorId: z.string().nullable(),
    occurredAt: z.string().datetime(),
    /** e.g. `28 Okt 2026, 18.33 WIB`. */
    occurredAtWib: z.string().min(1),
    summary: z.string().min(1),
  })
  .strict();
export type IntegrationActivityItemDto = z.infer<
  typeof IntegrationActivityItemDtoSchema
>;

/** GET .../integrations/:connectionId/activity?limit=20 (all members). */
export const IntegrationActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type IntegrationActivityQuery = z.infer<
  typeof IntegrationActivityQuerySchema
>;
