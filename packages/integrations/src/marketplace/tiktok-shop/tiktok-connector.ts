import {
  deriveCapabilities,
  MarketplaceConnectorError,
  type MarketplaceConnector,
  type MarketplaceExchangeResult,
} from '@tokoboss/domain';
import {
  tiktokAuthorizeUrl,
  tiktokExchangeCode,
  tiktokRefresh,
  type TikTokAuthDeps,
} from './tiktok-auth';
import { tiktokPushInventory } from './tiktok-inventory';
import { tiktokListingsPage } from './tiktok-listings';
import { tiktokRecentOrders } from './tiktok-orders';
import { tiktokAuthorizedShops } from './tiktok-shops';
import { TikTokSigner } from './tiktok-signer';
import { tiktokWarehouses } from './tiktok-warehouses';
import { tiktokParseWebhook, tiktokVerifyWebhook } from './tiktok-webhook';
import { tiktokSubscribeWebhooks } from './tiktok-webhook-subscribe';

/**
 * TikTok Shop (202309) `MarketplaceConnector` (UTA-39 / US20, RFC 04 task
 * 57c). Wires signer (54), HTTP + auth (55), catalog/orders (56) and
 * webhooks (57a/57b) into the domain port. Webhooks are subscribed per shop
 * on connect; `webhooks` is `supported` unless the address is not https or
 * a subscribe failed in this process, then `manual` (reconciliation). Fetch
 * and clock are injected; no DB access and nothing secret is logged.
 */
export interface TikTokConnectorConfig {
  readonly appKey: string;
  readonly appSecret: string;
  readonly serviceId: string;
  /** e.g. https://open-api.tiktokglobalshop.com */
  readonly host: string;
  /** e.g. https://auth.tiktok-shops.com */
  readonly authHost: string;
  /** e.g. https://services.tiktokshop.com */
  readonly authorizeHost: string;
  /** Public https URL of the TikTok webhook route. */
  readonly webhookAddress: string;
  readonly fetch: typeof fetch;
  readonly now: () => Date;
}

export function createTikTokConnector(
  config: TikTokConnectorConfig
): MarketplaceConnector {
  const { appKey, appSecret, webhookAddress } = config;
  const signer = new TikTokSigner({ appKey, appSecret });
  const deps: TikTokAuthDeps = { ...config, signer };
  const unsubscribed = new Set<string>();

  /** Best-effort subscribe per shop; a failure never fails the connect. */
  async function withWebhooks(
    result: MarketplaceExchangeResult
  ): Promise<MarketplaceExchangeResult> {
    const { credentials } = result;
    for (const shop of result.shops) {
      const ctx = { provider: 'tiktok_shop' as const, shop, credentials };
      const ok = await tiktokSubscribeWebhooks(deps, ctx, webhookAddress);
      if (ok) unsubscribed.delete(shop.providerStoreId);
      else unsubscribed.add(shop.providerStoreId);
    }
    return result;
  }

  return {
    provider: 'tiktok_shop',
    connectMode: 'oauth_redirect',
    buildAuthorizeUrl: (input) => tiktokAuthorizeUrl(deps, input),
    exchangeAuthCode: async (input) =>
      withWebhooks(await tiktokExchangeCode(deps, input)),
    refresh: (ctx) => tiktokRefresh(deps, ctx.credentials),
    validateCredentials: async (ctx) => {
      const token = ctx.credentials.secrets.access_token ?? '';
      const shops = await tiktokAuthorizedShops(deps, token, null);
      const id = ctx.shop.providerStoreId;
      if (!shops.some((shop) => shop.providerStoreId === id)) {
        throw new MarketplaceConnectorError('auth_invalid', 'TIKTOK_SHOP_GONE');
      }
    },
    describeCapabilities: (shop) => {
      const live =
        webhookAddress.startsWith('https://') &&
        !unsubscribed.has(shop.providerStoreId);
      const capabilities = deriveCapabilities({
        order_import: 'supported',
        inventory_sync: 'supported',
        webhooks: live ? 'supported' : 'manual',
      });
      return { capabilities, missingPermissions: [] };
    },
    listLocations: (ctx) => tiktokWarehouses(deps, ctx),
    listListingsPage: (ctx, cursor) => tiktokListingsPage(deps, ctx, cursor),
    listRecentOrders: (ctx, window) => tiktokRecentOrders(deps, ctx, window),
    verifyWebhook: (request) => tiktokVerifyWebhook(signer, request),
    parseWebhook: (rawBody) => tiktokParseWebhook(rawBody),
    pushInventory: (ctx, input) => tiktokPushInventory(deps, ctx, input),
  };
}
