import {
  MarketplaceConnectorError,
  type MarketplaceConnectorContext,
} from '@tokoboss/domain';
import type { TikTokQuery } from './tiktok-signer';
import {
  tiktokCall,
  tiktokText,
  type TikTokHttpDeps,
  type TikTokJson,
} from './tiktok-http';

/**
 * TikTok Shop (202309) shop-scoped call plus `data` readers (UTA-39 /
 * US20, RFC 04 task 56a). Catalog, warehouse and order reads all need the
 * seller token header and the shop's `shop_cipher` query param, and page
 * with an opaque `page_token`. Never logs tokens or the cipher.
 */
export interface TikTokShopScope {
  readonly accessToken: string;
  readonly shopCipher: string;
}

/** Token and cipher from the stored connection; reconnect fixes either. */
export function tiktokShopScope(
  ctx: MarketplaceConnectorContext
): TikTokShopScope {
  const accessToken = ctx.credentials.secrets.access_token;
  if (!accessToken) {
    throw new MarketplaceConnectorError('auth_invalid', 'TIKTOK_NO_TOKEN');
  }
  const shopCipher = ctx.shop.shopCipher;
  if (!shopCipher) {
    throw new MarketplaceConnectorError('auth_invalid', 'TIKTOK_NO_CIPHER');
  }
  return { accessToken, shopCipher };
}

/** Signed shop call: GET, or POST JSON when a body is given. */
export async function tiktokShopCall(
  deps: TikTokHttpDeps,
  ctx: MarketplaceConnectorContext,
  path: string,
  query: TikTokQuery = {},
  body?: TikTokJson
): Promise<TikTokJson> {
  const { accessToken, shopCipher } = tiktokShopScope(ctx);
  return tiktokCall(deps, path, {
    query: { ...query, shop_cipher: shopCipher },
    accessToken,
    ...(body ? { body } : {}),
  });
}

/** Query for one page; a null cursor asks for the first page. */
export function tiktokPageQuery(
  pageSize: number,
  cursor: string | null
): TikTokQuery {
  const query: Record<string, string> = { page_size: String(pageSize) };
  if (cursor !== null) query.page_token = cursor;
  return query;
}

/** An empty or missing `next_page_token` ends the walk. */
export function tiktokNextCursor(data: TikTokJson): string | null {
  return tiktokText(data.next_page_token);
}

export function tiktokObject(value: unknown): TikTokJson | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as TikTokJson;
}

/** Object rows of an array field; a missing or odd field reads as []. */
export function tiktokRows(json: TikTokJson, key: string): TikTokJson[] {
  const value = json[key];
  if (!Array.isArray(value)) return [];
  const rows: TikTokJson[] = [];
  for (const row of value) {
    const item = tiktokObject(row);
    if (item) rows.push(item);
  }
  return rows;
}

/** Finite numbers, or numeric strings (TikTok sends amounts as text). */
export function tiktokNumber(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
