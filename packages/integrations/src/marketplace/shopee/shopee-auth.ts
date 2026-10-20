import {
  MarketplaceConnectorError,
  type MarketplaceAuthorizeInput,
  type MarketplaceCredentials,
  type MarketplaceExchangeInput,
  type MarketplaceExchangeResult,
  type MarketplaceShop,
} from '@tokoboss/domain';
import {
  shopeeCall,
  shopeeId,
  shopeeText,
  shopeeUrl,
  type ShopeeHttpDeps,
  type ShopeeJson,
} from './shopee-http';

/**
 * Shopee v2 auth link, code → token, and refresh (UTA-39 / US20, RFC 04
 * task 50b). Tokens live only in `secrets`; nothing here logs them.
 */
export interface ShopeeAuthDeps extends ShopeeHttpDeps {
  readonly partnerId: number;
}

const PUBLIC = { kind: 'public' } as const;
const NO_META = { shopCipher: null, storeName: null, region: null } as const;

/** Shopee has no `state` param, so it rides on the redirect URL. */
export function shopeeAuthorizeUrl(
  deps: ShopeeAuthDeps,
  input: MarketplaceAuthorizeInput
): string {
  const redirect = new URL(input.redirectUri);
  redirect.searchParams.set('state', input.state);
  const url = shopeeUrl(deps, '/api/v2/shop/auth_partner', PUBLIC);
  url.searchParams.set('redirect', redirect.toString());
  return url.toString();
}

/** Callback carries `code` plus `shop_id` or `main_account_id`. */
export async function shopeeExchangeCode(
  deps: ShopeeAuthDeps,
  input: MarketplaceExchangeInput
): Promise<MarketplaceExchangeResult> {
  const { shop_id: shopId, main_account_id: mainId } = input.query;
  const owner = mainId
    ? { main_account_id: shopeeId(mainId) }
    : { shop_id: shopeeId(shopId ?? '') };
  const json = await shopeeCall(deps, '/api/v2/auth/token/get', PUBLIC, {
    code: input.code,
    partner_id: deps.partnerId,
    ...owner,
  });
  const ids = Array.isArray(json.shop_id_list) ? json.shop_id_list : [];
  const shopIds = mainId ? ids.map(String) : [String(owner.shop_id)];
  return {
    credentials: shopeeCredentials(deps, json, null),
    shops: shopIds.map((id): MarketplaceShop => ({
      ...NO_META,
      providerStoreId: id,
      providerAccountId: mainId ?? null,
    })),
  };
}

/** Refresh rotates both tokens; the shop's auth expiry is kept as is. */
export async function shopeeRefresh(
  deps: ShopeeAuthDeps,
  shop: MarketplaceShop,
  current: MarketplaceCredentials
): Promise<MarketplaceCredentials> {
  const refreshToken = current.secrets.refresh_token;
  if (!refreshToken) {
    throw new MarketplaceConnectorError('auth_invalid', 'SHOPEE_NO_REFRESH');
  }
  const json = await shopeeCall(deps, '/api/v2/auth/access_token/get', PUBLIC, {
    refresh_token: refreshToken,
    partner_id: deps.partnerId,
    shop_id: shopeeId(shop.providerStoreId),
  });
  return shopeeCredentials(deps, json, current);
}

function shopeeCredentials(
  deps: ShopeeAuthDeps,
  json: ShopeeJson,
  current: MarketplaceCredentials | null
): MarketplaceCredentials {
  const accessToken = shopeeText(json.access_token);
  const refreshToken = shopeeText(json.refresh_token);
  if (!accessToken || !refreshToken) {
    throw new MarketplaceConnectorError('unavailable', 'SHOPEE_TOKEN_MISSING');
  }
  const ttl = typeof json.expire_in === 'number' ? json.expire_in : 0;
  return {
    secrets: { access_token: accessToken, refresh_token: refreshToken },
    grantedScopes: current?.grantedScopes ?? [],
    accessTokenExpiresAt:
      ttl > 0 ? new Date(deps.now().getTime() + ttl * 1000) : null,
    authExpiresAt: current?.authExpiresAt ?? null,
  };
}
