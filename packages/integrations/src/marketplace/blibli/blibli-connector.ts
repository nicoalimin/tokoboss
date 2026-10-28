import { randomUUID } from 'node:crypto';
import {
  deriveCapabilities,
  MarketplaceConnectorError,
  type MarketplaceCapabilities,
  type MarketplaceConnector,
  type MarketplaceConnectorContext,
  type MarketplaceLocation,
} from '@tokoboss/domain';
import type { BlibliPartnerConfig } from './blibli-client';
import {
  blibliCall,
  blibliText,
  type BlibliHttpDeps,
  type BlibliJson,
} from './blibli-http';
import { blibliListingsPage } from './blibli-listings';
import { blibliRecentOrders } from './blibli-orders';
import { blibliPushInventory } from './blibli-stock';

/**
 * Blibli `MarketplaceConnector` (UTA-39 / US20, RFC 04 task 61). Credential
 * binding: no OAuth, the Admin pastes merchant code + API Seller Key +
 * Signature Key and one product-list read validates them. Wires the HTTP
 * helper (60a), listings (60b) and orders preview (60c) into the domain
 * port. Webhooks stay `unknown` and every push is rejected until spike U7
 * confirms Blibli's scheme (RFC O5), so Blibli is polling only. Fetch and
 * clock are injected; no DB access and nothing secret is logged.
 */
export const BLIBLI_PICKUP_POINT_PATH =
  '/mta/api/businesspartner/v1/product/getPickupPoint';

export const BLIBLI_CAPABILITIES: MarketplaceCapabilities = deriveCapabilities({
  order_import: 'supported',
  inventory_sync: 'supported',
  webhooks: 'unknown',
});

export interface BlibliConnectorConfig extends BlibliPartnerConfig {
  readonly fetch: typeof fetch;
  readonly now: () => Date;
  readonly requestId?: () => string;
}

function noOAuth(): never {
  throw new MarketplaceConnectorError('bad_request', 'BLIBLI_NO_OAUTH');
}

/** Pickup points → locations; blank or duplicate codes dropped. */
export async function blibliPickupPoints(
  deps: BlibliHttpDeps,
  ctx: MarketplaceConnectorContext
): Promise<MarketplaceLocation[]> {
  const data = await blibliCall(deps, ctx, {
    method: 'GET',
    path: BLIBLI_PICKUP_POINT_PATH,
  });
  const content = Array.isArray(data.content) ? data.content : [];
  const seen = new Set<string>();
  const rows: MarketplaceLocation[] = [];
  for (const item of content) {
    if (typeof item !== 'object' || item === null) continue;
    const json = item as BlibliJson;
    const code = blibliText(json.code) ?? blibliText(json.pickupPointCode);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    rows.push({ externalLocationId: code, name: blibliText(json.name) });
  }
  return rows;
}

export function createBlibliConnector(
  config: BlibliConnectorConfig
): MarketplaceConnector {
  const { env, clientId, clientKey, channelId } = config;
  const deps: BlibliHttpDeps = {
    partner: { env, clientId, clientKey, channelId },
    fetch: config.fetch,
    now: config.now,
    requestId: config.requestId ?? (() => randomUUID()),
  };
  return {
    provider: 'blibli',
    connectMode: 'credential_binding',
    buildAuthorizeUrl: () => noOAuth(),
    exchangeAuthCode: async () => noOAuth(),
    refresh: async (ctx) => ctx.credentials,
    validateCredentials: async (ctx) => {
      await blibliListingsPage(deps, ctx, null);
    },
    describeCapabilities: () => ({
      capabilities: BLIBLI_CAPABILITIES,
      missingPermissions: [],
    }),
    listLocations: (ctx) => blibliPickupPoints(deps, ctx),
    listListingsPage: (ctx, cursor) => blibliListingsPage(deps, ctx, cursor),
    listRecentOrders: (ctx, window) => blibliRecentOrders(deps, ctx, window),
    verifyWebhook: () => false,
    parseWebhook: () => [],
    pushInventory: (ctx, input) => blibliPushInventory(deps, ctx, input),
  };
}
