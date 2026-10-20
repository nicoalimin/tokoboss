import { MarketplaceConnectorError } from '@tokoboss/domain';

/**
 * TikTok Shop Partner API (202309) response envelope (UTA-39 / US20, RFC 04
 * task 55a-1): one fetch, the `{ code, message, data }` check, and the
 * status/code mapping to MarketplaceConnectorError. Never logs secrets.
 */
export type TikTokJson = Record<string, unknown>;

/** One fetch plus the TikTok `{ code, message, data }` envelope check. */
export async function tiktokFetch(
  fetchFn: typeof fetch,
  url: URL,
  init: RequestInit
): Promise<TikTokJson> {
  let res: Response;
  try {
    res = await fetchFn(url, init);
  } catch {
    throw new MarketplaceConnectorError('unavailable', 'TIKTOK_NETWORK_ERROR');
  }
  const json = ((await res.json().catch(() => null)) ?? {}) as TikTokJson;
  const code = typeof json.code === 'number' ? json.code : -1;
  if (res.ok && code === 0) {
    const { data } = json;
    return data && typeof data === 'object' ? (data as TikTokJson) : {};
  }
  const message = typeof json.message === 'string' ? json.message : '';
  throw tiktokError(res.status, code, message);
}

/** Envelope codes are public numbers; the message only steers the kind. */
export function tiktokError(
  status: number,
  code: number,
  message: string
): MarketplaceConnectorError {
  const name = code > 0 ? `TIKTOK_${code}` : `TIKTOK_HTTP_${status}`;
  if (status === 429 || /too many|rate limit/i.test(message)) {
    return new MarketplaceConnectorError('rate_limited', name);
  }
  if (status >= 500) return new MarketplaceConnectorError('unavailable', name);
  if (
    status === 401 ||
    status === 403 ||
    /token|auth|permission/i.test(message)
  ) {
    return new MarketplaceConnectorError('auth_invalid', name);
  }
  return new MarketplaceConnectorError('bad_request', name);
}

export function tiktokText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
