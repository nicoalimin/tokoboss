import { MarketplaceConnectorError } from '@tokoboss/domain';
import type { ShopeeSignScope, ShopeeSigner } from './shopee-signer';

/**
 * Shared Shopee Open Platform v2 HTTP helper (UTA-39 / US20, RFC 04
 * task 50a): signed URL, one JSON call, and provider error mapping to
 * `MarketplaceConnectorError`. Injected fetch and clock, no DB access;
 * never logs or echoes tokens, codes, or signatures.
 */
export interface ShopeeHttpDeps {
  readonly signer: ShopeeSigner;
  /** e.g. https://partner.shopeemobile.com (live) or the sandbox host. */
  readonly host: string;
  readonly fetch: typeof fetch;
  readonly now: () => Date;
}

export type ShopeeJson = Record<string, unknown>;

export function shopeeUrl(
  deps: ShopeeHttpDeps,
  path: string,
  scope: ShopeeSignScope
): URL {
  const url = new URL(path, deps.host);
  const params = deps.signer.signedParams(path, deps.now(), scope);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

/** GET without a body, POST JSON with one; Shopee `error` → typed error. */
export async function shopeeCall(
  deps: ShopeeHttpDeps,
  path: string,
  scope: ShopeeSignScope,
  body?: ShopeeJson
): Promise<ShopeeJson> {
  const init: RequestInit = body
    ? {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }
    : { method: 'GET' };
  let res: Response;
  try {
    res = await deps.fetch(shopeeUrl(deps, path, scope), init);
  } catch {
    throw new MarketplaceConnectorError('unavailable', 'SHOPEE_NETWORK_ERROR');
  }
  const json = ((await res.json().catch(() => null)) ?? {}) as ShopeeJson;
  const error = typeof json.error === 'string' ? json.error : '';
  if (res.ok && !error) return json;
  throw shopeeError(res.status, error);
}

/** Shopee `error` codes are public strings; they never carry secrets. */
export function shopeeError(
  status: number,
  error: string
): MarketplaceConnectorError {
  const code = `SHOPEE_${error || `HTTP_${status}`}`;
  if (status === 429 || error.includes('too_many')) {
    return new MarketplaceConnectorError('rate_limited', code);
  }
  if (status >= 500) return new MarketplaceConnectorError('unavailable', code);
  if (status === 401 || status === 403 || /auth|token|permission/.test(error)) {
    return new MarketplaceConnectorError('auth_invalid', code);
  }
  return new MarketplaceConnectorError('bad_request', code);
}

/** Shopee numeric ids arrive as strings in our redirect/query data. */
export function shopeeId(value: string): number {
  const id = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(id) || id <= 0) {
    throw new MarketplaceConnectorError('bad_request', 'SHOPEE_ID_INVALID');
  }
  return id;
}

export function shopeeText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
