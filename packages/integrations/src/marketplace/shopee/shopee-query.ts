import { MarketplaceConnectorError } from '@tokoboss/domain';
import {
  shopeeError,
  shopeeUrl,
  type ShopeeHttpDeps,
  type ShopeeJson,
} from './shopee-http';
import type { ShopeeSignScope } from './shopee-signer';

/**
 * Shopee v2 GET with list query params, plus readers for the `response`
 * envelope (UTA-39 / US20, RFC 04 task 51a). Catalog, location and order
 * reads page through GET endpoints whose params ride on the query string;
 * only the path is signed, so they stay out of the signature. Never logs
 * or echoes tokens.
 */
export type ShopeeQueryValue = string | number | readonly string[];
export type ShopeeQuery = Readonly<Record<string, ShopeeQueryValue>>;

/** Array values repeat the key (`item_status=NORMAL&item_status=UNLIST`). */
export function shopeeQueryUrl(
  deps: ShopeeHttpDeps,
  path: string,
  scope: ShopeeSignScope,
  query: ShopeeQuery
): URL {
  const url = shopeeUrl(deps, path, scope);
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string' || typeof value === 'number') {
      url.searchParams.set(key, String(value));
    } else {
      for (const item of value) url.searchParams.append(key, item);
    }
  }
  return url;
}

/** Signed GET; Shopee `error` or a non-2xx status → typed error. */
export async function shopeeGet(
  deps: ShopeeHttpDeps,
  path: string,
  scope: ShopeeSignScope,
  query: ShopeeQuery
): Promise<ShopeeJson> {
  let res: Response;
  try {
    const url = shopeeQueryUrl(deps, path, scope, query);
    res = await deps.fetch(url, { method: 'GET' });
  } catch {
    throw new MarketplaceConnectorError('unavailable', 'SHOPEE_NETWORK_ERROR');
  }
  const json = ((await res.json().catch(() => null)) ?? {}) as ShopeeJson;
  const error = typeof json.error === 'string' ? json.error : '';
  if (res.ok && !error) return json;
  throw shopeeError(res.status, error);
}

/** Product, order and logistics reads wrap their payload in `response`. */
export function shopeeResponse(json: ShopeeJson): ShopeeJson {
  return shopeeObject(json.response) ?? {};
}

export function shopeeObject(value: unknown): ShopeeJson | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as ShopeeJson;
}

/** Object rows of an array field; a missing or odd field reads as []. */
export function shopeeRows(json: ShopeeJson, key: string): ShopeeJson[] {
  const value = json[key];
  if (!Array.isArray(value)) return [];
  const rows: ShopeeJson[] = [];
  for (const row of value) {
    const item = shopeeObject(row);
    if (item) rows.push(item);
  }
  return rows;
}

export function shopeeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
