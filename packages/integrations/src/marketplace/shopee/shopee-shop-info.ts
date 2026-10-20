import {
  MarketplaceConnectorError,
  type MarketplaceConnectorContext,
  type MarketplaceCredentials,
  type MarketplaceShop,
} from '@tokoboss/domain';
import {
  shopeeCall,
  shopeeId,
  shopeeText,
  type ShopeeHttpDeps,
} from './shopee-http';
import type { ShopeeSignScope } from './shopee-signer';

/**
 * Shopee v2 shop info and authorization expiry (UTA-39 / US20, RFC 04
 * task 50c). One shop-signed `get_shop_info` call fills the store name,
 * region and the shop's auth expiry, and doubles as the credential check.
 * The access token only goes into the signature; nothing is logged.
 */
export interface ShopeeShopInfo {
  readonly shop: MarketplaceShop;
  readonly authExpiresAt: Date | null;
}

/** Shop-level signing scope from the stored access token. */
export function shopeeShopScope(
  ctx: MarketplaceConnectorContext
): ShopeeSignScope {
  const accessToken = ctx.credentials.secrets.access_token;
  if (!accessToken) {
    throw new MarketplaceConnectorError('auth_invalid', 'SHOPEE_NO_TOKEN');
  }
  const shopId = shopeeId(ctx.shop.providerStoreId);
  return { kind: 'shop', accessToken, shopId };
}

/** Banned or frozen shops cannot be synced, so they fail loudly. */
export async function shopeeShopInfo(
  deps: ShopeeHttpDeps,
  ctx: MarketplaceConnectorContext
): Promise<ShopeeShopInfo> {
  const path = '/api/v2/shop/get_shop_info';
  const json = await shopeeCall(deps, path, shopeeShopScope(ctx));
  const status = shopeeText(json.status);
  if (status && status !== 'NORMAL') {
    const code = `SHOPEE_SHOP_${status}`;
    throw new MarketplaceConnectorError('unsupported_account', code);
  }
  const expire = typeof json.expire_time === 'number' ? json.expire_time : 0;
  return {
    shop: {
      ...ctx.shop,
      storeName: shopeeText(json.shop_name) ?? ctx.shop.storeName,
      region: shopeeText(json.region) ?? ctx.shop.region,
    },
    authExpiresAt: expire > 0 ? new Date(expire * 1000) : null,
  };
}

/** Fill the shop auth expiry that token get/refresh (50b) leaves as is. */
export function withShopeeAuthExpiry(
  credentials: MarketplaceCredentials,
  info: ShopeeShopInfo
): MarketplaceCredentials {
  const authExpiresAt = info.authExpiresAt ?? credentials.authExpiresAt;
  return { ...credentials, authExpiresAt };
}

/** `validateCredentials`: a successful shop info call proves the token. */
export async function shopeeValidate(
  deps: ShopeeHttpDeps,
  ctx: MarketplaceConnectorContext
): Promise<void> {
  await shopeeShopInfo(deps, ctx);
}
