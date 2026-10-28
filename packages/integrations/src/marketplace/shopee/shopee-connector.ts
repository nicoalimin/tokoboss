import type {
  MarketplaceCapabilities,
  MarketplaceConnector,
  MarketplaceExchangeResult,
  MarketplaceShop,
} from '@tokoboss/domain';
import { deriveCapabilities } from '@tokoboss/domain';
import {
  shopeeAuthorizeUrl,
  shopeeExchangeCode,
  shopeeRefresh,
} from './shopee-auth';
import type { ShopeeHttpDeps } from './shopee-http';
import { shopeeListingsPage } from './shopee-listings';
import { shopeeLocations } from './shopee-locations';
import { shopeeRecentOrders } from './shopee-orders';
import { shopeeParsePush, shopeeVerifyPush } from './shopee-push';
import {
  shopeeShopInfo,
  shopeeValidate,
  withShopeeAuthExpiry,
} from './shopee-shop-info';
import { ShopeeSigner } from './shopee-signer';
import { shopeePushInventory } from './shopee-stock';

/**
 * Shopee v2 `MarketplaceConnector` (UTA-39 / US20, RFC 04 task 52b).
 * Wires the signer (49), auth (50b), shop info (50c), catalog (51) and
 * push intake (52a) into the domain port. Fetch and clock are injected;
 * no DB access and nothing secret is logged.
 */
export interface ShopeeConnectorConfig {
  readonly partnerId: number;
  readonly partnerKey: string;
  /** e.g. https://partner.shopeemobile.com (live) or the sandbox host. */
  readonly host: string;
  readonly fetch: typeof fetch;
  readonly now: () => Date;
}

/**
 * Shopee grants no OAuth scopes, so nothing is ever missing. Push is set
 * once per app (not per shop), so webhooks are supported; labels and
 * pickup stay unknown until Story 07 confirms them in the sandbox.
 */
export const SHOPEE_CAPABILITIES: MarketplaceCapabilities = deriveCapabilities({
  order_import: 'supported',
  inventory_sync: 'supported',
  webhooks: 'supported',
});

export function createShopeeConnector(
  config: ShopeeConnectorConfig
): MarketplaceConnector {
  const { partnerId, partnerKey, host, now } = config;
  const signer = new ShopeeSigner({ partnerId, partnerKey });
  const deps: ShopeeHttpDeps = { signer, host, fetch: config.fetch, now };
  const auth = { ...deps, partnerId };

  /** Fill store name, region and (single shop) the auth expiry. */
  async function withShopInfo(
    result: MarketplaceExchangeResult
  ): Promise<MarketplaceExchangeResult> {
    const { credentials } = result;
    const shops: MarketplaceShop[] = [];
    let current = credentials;
    for (const shop of result.shops) {
      const info = await shopeeShopInfo(deps, {
        provider: 'shopee',
        shop,
        credentials,
      });
      shops.push(info.shop);
      if (result.shops.length === 1) {
        current = withShopeeAuthExpiry(credentials, info);
      }
    }
    return { credentials: current, shops };
  }

  return {
    provider: 'shopee',
    connectMode: 'oauth_redirect',
    buildAuthorizeUrl: (input) => shopeeAuthorizeUrl(auth, input),
    exchangeAuthCode: async (input) =>
      withShopInfo(await shopeeExchangeCode(auth, input)),
    refresh: (ctx) => shopeeRefresh(auth, ctx.shop, ctx.credentials),
    validateCredentials: (ctx) => shopeeValidate(deps, ctx),
    describeCapabilities: () => ({
      capabilities: { ...SHOPEE_CAPABILITIES },
      missingPermissions: [],
    }),
    listLocations: (ctx) => shopeeLocations(deps, ctx),
    listListingsPage: (ctx, cursor) => shopeeListingsPage(deps, ctx, cursor),
    listRecentOrders: (ctx, window) => shopeeRecentOrders(deps, ctx, window),
    verifyWebhook: (request) => shopeeVerifyPush(signer, request),
    parseWebhook: (rawBody) => shopeeParsePush(rawBody),
    pushInventory: (ctx, input) => shopeePushInventory(deps, ctx, input),
  };
}
