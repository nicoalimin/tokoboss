import { z } from 'zod';
import { MarketplaceProviderSchema } from './integrations';

/**
 * Marketplace integration request wire contracts (UTA-39 / US20, RFC 04
 * task 80b): start connection, Blibli key form, location link and the
 * OAuth callback `result`. Bodies are strict. Only the Blibli key form
 * carries secrets, inbound; no response here echoes keys or tokens.
 */

/** POST /api/workspaces/[workspaceId]/integrations (Admin). */
export const IntegrationStartConnectionBodySchema = z
  .object({ provider: MarketplaceProviderSchema })
  .strict();
export type IntegrationStartConnectionBody = z.infer<
  typeof IntegrationStartConnectionBodySchema
>;

/** Shopee / TikTok Shop: send the browser to `authorizeUrl` (10 min). */
export const IntegrationStartOAuthResponseSchema = z
  .object({
    mode: z.literal('oauth_redirect'),
    provider: MarketplaceProviderSchema,
    connectionId: z.string().min(1).nullable(),
    authorizeUrl: z.string().url(),
    expiresAt: z.string().datetime(),
  })
  .strict();

/** Blibli: no redirect; the wizard shows the key form (step 3). */
export const IntegrationStartCredentialResponseSchema = z
  .object({
    mode: z.literal('credential_binding'),
    provider: MarketplaceProviderSchema,
    connectionId: z.string().min(1).nullable(),
  })
  .strict();

/** Start / reauthorize response, keyed on the connect mode. */
export const IntegrationStartConnectionResponseSchema = z.discriminatedUnion(
  'mode',
  [
    IntegrationStartOAuthResponseSchema,
    IntegrationStartCredentialResponseSchema,
  ]
);
export type IntegrationStartConnectionResponse = z.infer<
  typeof IntegrationStartConnectionResponseSchema
>;

/**
 * Blibli key form (Admin): merchant code + API Seller Key + Signature
 * Key, trimmed and required. Inbound only; never echoed back or logged.
 */
export const IntegrationBlibliKeyFormBodySchema = z
  .object({
    merchantCode: z.string().trim().min(1),
    apiSellerKey: z.string().trim().min(1),
    signatureKey: z.string().trim().min(1),
  })
  .strict();
export type IntegrationBlibliKeyFormBody = z.infer<
  typeof IntegrationBlibliKeyFormBodySchema
>;

/** PUT .../locations/[locationLinkId]: link a warehouse; null clears it. */
export const IntegrationLocationLinkBodySchema = z
  .object({ warehouseId: z.string().trim().min(1).nullable() })
  .strict();
export type IntegrationLocationLinkBody = z.infer<
  typeof IntegrationLocationLinkBodySchema
>;

export const IntegrationLocationLinkResponseSchema = z
  .object({
    connectionId: z.string().min(1),
    externalLocationId: z.string().min(1),
    warehouseId: z.string().min(1).nullable(),
  })
  .strict();
export type IntegrationLocationLinkResponse = z.infer<
  typeof IntegrationLocationLinkResponseSchema
>;

/** One provider location and its source warehouse (null = not linked). */
export const IntegrationLocationLinkViewSchema = z
  .object({
    connectionId: z.string().min(1),
    externalLocationId: z.string().min(1),
    name: z.string().nullable(),
    warehouseId: z.string().min(1).nullable(),
  })
  .strict();
export type IntegrationLocationLinkView = z.infer<
  typeof IntegrationLocationLinkViewSchema
>;

/** GET .../locations (Admin/Manager): Pilih gudang sumber list (121). */
export const IntegrationLocationLinkListResponseSchema = z
  .object({ locations: z.array(IntegrationLocationLinkViewSchema) })
  .strict();
export type IntegrationLocationLinkListResponse = z.infer<
  typeof IntegrationLocationLinkListResponseSchema
>;

/** OAuth callback redirect: /w/<id>/integrasi/<connectionId>?result=… */
export const IntegrationCallbackResultSchema = z.enum([
  'connected',
  'needs_reauth',
  'blocked',
  'mismatch',
  'cancelled',
  'unavailable',
]);
export type IntegrationCallbackResult = z.infer<
  typeof IntegrationCallbackResultSchema
>;
