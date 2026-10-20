import type { TikTokQuery, TikTokSigner } from './tiktok-signer';
import { tiktokFetch, type TikTokJson } from './tiktok-envelope';

export { tiktokError, tiktokFetch, tiktokText } from './tiktok-envelope';
export type { TikTokJson } from './tiktok-envelope';

/**
 * TikTok Shop Partner API (202309) HTTP helper (UTA-39 / US20, RFC 04 task
 * 55a-2): signed URL and JSON call with the access-token header; envelope
 * handling lives in tiktok-envelope.ts. Never logs tokens or signatures.
 */
export interface TikTokHttpDeps {
  readonly signer: TikTokSigner;
  /** e.g. https://open-api.tiktokglobalshop.com */
  readonly host: string;
  readonly fetch: typeof fetch;
  readonly now: () => Date;
}

export interface TikTokCallOptions {
  readonly query?: TikTokQuery;
  readonly body?: TikTokJson;
  /** Sent as `x-tts-access-token`; never part of the signature. */
  readonly accessToken?: string;
}

export function tiktokUrl(
  deps: TikTokHttpDeps,
  path: string,
  query: TikTokQuery = {},
  body = ''
): URL {
  const url = new URL(path, deps.host);
  const params = deps.signer.signedQuery(path, deps.now(), query, body);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

/** Signed GET, or POST JSON when a body is given; returns envelope `data`. */
export async function tiktokCall(
  deps: TikTokHttpDeps,
  path: string,
  options: TikTokCallOptions = {}
): Promise<TikTokJson> {
  const body = options.body ? JSON.stringify(options.body) : '';
  const headers = new Headers({ 'content-type': 'application/json' });
  if (options.accessToken)
    headers.set('x-tts-access-token', options.accessToken);
  const init: RequestInit = { method: body ? 'POST' : 'GET', headers };
  if (body) init.body = body;
  const url = tiktokUrl(deps, path, options.query, body);
  return tiktokFetch(deps.fetch, url, init);
}
