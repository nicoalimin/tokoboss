import {
  MarketplaceConnectorError,
  type MarketplaceAuthorizeInput,
  type MarketplaceCredentials,
  type MarketplaceExchangeInput,
  type MarketplaceExchangeResult,
} from '@tokoboss/domain';
import { tiktokText, type TikTokHttpDeps } from './tiktok-http';
import { tiktokAuthorizedShops } from './tiktok-shops';
import {
  tiktokCredentials,
  tiktokToken,
  type TikTokTokenDeps,
} from './tiktok-token';

/**
 * TikTok Shop auth link, code → token + authorized shops, and refresh
 * (UTA-39 / US20, RFC 04 task 55c-2). Tokens live only in `secrets`;
 * nothing here logs them or the app secret.
 */
export interface TikTokAuthDeps extends TikTokHttpDeps, TikTokTokenDeps {
  readonly serviceId: string;
  /** e.g. https://services.tiktokshop.com */
  readonly authorizeHost: string;
}

/** The redirect URI is fixed in Partner Center; only `state` rides along. */
export function tiktokAuthorizeUrl(
  deps: TikTokAuthDeps,
  input: MarketplaceAuthorizeInput
): string {
  const url = new URL('/open/authorize', deps.authorizeHost);
  url.searchParams.set('service_id', deps.serviceId);
  url.searchParams.set('state', input.state);
  return url.toString();
}

/** The store id is known only after exchange: list the authorized shops. */
export async function tiktokExchangeCode(
  deps: TikTokAuthDeps,
  input: MarketplaceExchangeInput
): Promise<MarketplaceExchangeResult> {
  const json = await tiktokToken(deps, {
    grant_type: 'authorized_code',
    auth_code: input.code,
  });
  const credentials = tiktokCredentials(json, null);
  const accessToken = credentials.secrets.access_token ?? '';
  const sellerId = tiktokText(json.open_id);
  const shops = await tiktokAuthorizedShops(deps, accessToken, sellerId);
  return { credentials, shops };
}

/** Refresh rotates both tokens; kept scopes/expiry fill any gaps. */
export async function tiktokRefresh(
  deps: TikTokAuthDeps,
  current: MarketplaceCredentials
): Promise<MarketplaceCredentials> {
  const refreshToken = current.secrets.refresh_token;
  if (!refreshToken) {
    throw new MarketplaceConnectorError('auth_invalid', 'TIKTOK_NO_REFRESH');
  }
  const json = await tiktokToken(deps, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  return tiktokCredentials(json, current);
}
