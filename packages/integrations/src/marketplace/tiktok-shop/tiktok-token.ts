import {
  MarketplaceConnectorError,
  type MarketplaceCredentials,
} from '@tokoboss/domain';
import { tiktokFetch, tiktokText, type TikTokJson } from './tiktok-http';

/**
 * TikTok Shop token get/refresh (UTA-39 / US20, RFC 04 task 55c-1). These
 * calls go to the auth host, unsigned, with app key/secret in the query.
 * Tokens live only in `secrets`; nothing here logs them or the secret.
 */
export interface TikTokTokenDeps {
  readonly appKey: string;
  readonly appSecret: string;
  /** e.g. https://auth.tiktok-shops.com */
  readonly authHost: string;
  readonly fetch: typeof fetch;
}

export type TikTokGrant =
  | { readonly grant_type: 'authorized_code'; readonly auth_code: string }
  | { readonly grant_type: 'refresh_token'; readonly refresh_token: string };

/** GET /api/v2/token/get or /token/refresh; returns envelope `data`. */
export async function tiktokToken(
  deps: TikTokTokenDeps,
  grant: TikTokGrant
): Promise<TikTokJson> {
  const refresh = grant.grant_type === 'refresh_token';
  const path = refresh ? '/api/v2/token/refresh' : '/api/v2/token/get';
  const url = new URL(path, deps.authHost);
  url.searchParams.set('app_key', deps.appKey);
  url.searchParams.set('app_secret', deps.appSecret);
  for (const [key, value] of Object.entries(grant)) {
    url.searchParams.set(key, value);
  }
  return tiktokFetch(deps.fetch, url, { method: 'GET' });
}

/** Expiries arrive as absolute Unix seconds, not TTLs. */
export function tiktokCredentials(
  json: TikTokJson,
  current: MarketplaceCredentials | null
): MarketplaceCredentials {
  const accessToken = tiktokText(json.access_token);
  const refreshToken = tiktokText(json.refresh_token);
  if (!accessToken || !refreshToken) {
    throw new MarketplaceConnectorError('unavailable', 'TIKTOK_TOKEN_MISSING');
  }
  const scopes = Array.isArray(json.granted_scopes)
    ? json.granted_scopes.filter((s): s is string => typeof s === 'string')
    : null;
  return {
    secrets: { access_token: accessToken, refresh_token: refreshToken },
    grantedScopes: scopes ?? current?.grantedScopes ?? [],
    accessTokenExpiresAt: unixDate(json.access_token_expire_in),
    authExpiresAt:
      unixDate(json.refresh_token_expire_in) ?? current?.authExpiresAt ?? null,
  };
}

function unixDate(value: unknown): Date | null {
  return typeof value === 'number' && value > 0 ? new Date(value * 1000) : null;
}
