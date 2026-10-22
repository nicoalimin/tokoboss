import { z } from 'zod';

/**
 * Marketplace integration wire contracts (UTA-39 / US20, RFC 04 task 80a):
 * connection vocabulary (mirrors domain marketplace-connection.ts) and the
 * connection list / detail responses. Dates are ISO strings on the wire.
 * Views are strict, so a stray key (token, key, cipher, scope) fails parsing
 * and responses can never carry secrets or buyer PII.
 */

export const MarketplaceProviderSchema = z.enum([
  'shopee',
  'tiktok_shop',
  'blibli',
]);
export type MarketplaceProviderWire = z.infer<typeof MarketplaceProviderSchema>;

export const MarketplaceConnectModeSchema = z.enum([
  'oauth_redirect',
  'credential_binding',
]);

/** PRD statuses; Belum terhubung is the absence of a row, not a status. */
export const MarketplaceConnectionStatusSchema = z.enum([
  'connected',
  'needs_reauth',
  'disconnected',
]);

export const MarketplaceDisconnectSourceSchema = z.enum([
  'admin',
  'seller',
  'provider',
]);

export const MarketplaceCapabilityStateSchema = z.enum([
  'supported',
  'manual',
  'unsupported',
  'unknown',
]);

export const MarketplaceCapabilitiesSchema = z
  .object({
    order_import: MarketplaceCapabilityStateSchema,
    inventory_sync: MarketplaceCapabilityStateSchema,
    labels: MarketplaceCapabilityStateSchema,
    webhooks: MarketplaceCapabilityStateSchema,
    pickup: MarketplaceCapabilityStateSchema,
  })
  .strict();

export const InitialImportStatusSchema = z.enum([
  'queued',
  'running',
  'complete',
  'incomplete',
  'failed',
]);

/** One connection on the Integrasi list and detail screens (no secrets). */
export const IntegrationConnectionViewSchema = z
  .object({
    id: z.string().min(1),
    workspaceId: z.string().min(1),
    provider: MarketplaceProviderSchema,
    connectMode: MarketplaceConnectModeSchema,
    providerStoreId: z.string().min(1),
    storeName: z.string().nullable(),
    region: z.string().nullable(),
    status: MarketplaceConnectionStatusSchema,
    disconnectSource: MarketplaceDisconnectSourceSchema.nullable(),
    disconnectedAt: z.string().datetime().nullable(),
    capabilities: MarketplaceCapabilitiesSchema,
    missingPermissions: z.array(z.string().min(1)),
    authExpiresAt: z.string().datetime().nullable(),
    lastCheckedAt: z.string().datetime().nullable(),
    lastErrorCode: z.string().nullable(),
    orderImportEnabled: z.boolean(),
    inventorySyncEnabled: z.boolean(),
    initialImportStatus: InitialImportStatusSchema.nullable(),
    connectedBy: z.string().nullable(),
    connectedAt: z.string().datetime().nullable(),
  })
  .strict();
export type IntegrationConnectionView = z.infer<
  typeof IntegrationConnectionViewSchema
>;

/** GET /api/workspaces/[workspaceId]/integrations (all members). */
export const IntegrationConnectionListResponseSchema = z.object({
  connections: z.array(IntegrationConnectionViewSchema),
});
export type IntegrationConnectionListResponse = z.infer<
  typeof IntegrationConnectionListResponseSchema
>;

/** GET /api/workspaces/[workspaceId]/integrations/[connectionId]. */
export const IntegrationConnectionDetailResponseSchema = z.object({
  connection: IntegrationConnectionViewSchema,
});
export type IntegrationConnectionDetailResponse = z.infer<
  typeof IntegrationConnectionDetailResponseSchema
>;
