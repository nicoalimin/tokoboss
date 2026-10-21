import {
  MarketplaceConnectorError,
  type MarketplaceConnectorContext,
} from '@tokoboss/domain';
import {
  blibliRequest,
  type BlibliPartnerConfig,
  type BlibliRequestInput,
  type BlibliSellerKeys,
} from './blibli-client';

/**
 * Blibli Seller API call and response envelope (UTA-39 / US20, RFC 04 task
 * 60a): seller keys from the sealed `blibli_keys` secrets, one signed
 * fetch, and the `{ success, errorCode, errorMessage }` check mapped to
 * MarketplaceConnectorError. Never logs keys, signatures or bodies.
 */
export type BlibliJson = Record<string, unknown>;

export interface BlibliHttpDeps {
  readonly partner: BlibliPartnerConfig;
  readonly fetch: typeof fetch;
  readonly now: () => Date;
  readonly requestId: () => string;
}

export interface BlibliCall {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly body?: BlibliJson;
}

/** The merchant code falls back to the connection's provider store id. */
export function blibliSellerKeys(
  ctx: MarketplaceConnectorContext
): BlibliSellerKeys {
  const secrets = ctx.credentials.secrets;
  const merchantCode = secrets.merchantCode || ctx.shop.providerStoreId;
  const apiSellerKey = secrets.apiSellerKey ?? '';
  if (!merchantCode || !apiSellerKey) {
    throw new MarketplaceConnectorError('auth_invalid', 'BLIBLI_KEYS_MISSING');
  }
  return {
    merchantCode,
    apiSellerKey,
    signatureKey: secrets.signatureKey ?? '',
  };
}

/** One signed call; returns the whole JSON body when Blibli reports success. */
export async function blibliCall(
  deps: BlibliHttpDeps,
  ctx: MarketplaceConnectorContext,
  call: BlibliCall
): Promise<BlibliJson> {
  const input: BlibliRequestInput = {
    method: call.method,
    path: call.path,
    now: deps.now(),
    requestId: deps.requestId(),
    ...(call.query ? { query: call.query } : {}),
    ...(call.body ? { body: JSON.stringify(call.body) } : {}),
  };
  const { url, init } = blibliRequest(
    deps.partner,
    blibliSellerKeys(ctx),
    input
  );
  let res: Response;
  try {
    res = await deps.fetch(url, init);
  } catch {
    throw new MarketplaceConnectorError('unavailable', 'BLIBLI_NETWORK_ERROR');
  }
  const json = ((await res.json().catch(() => null)) ?? {}) as BlibliJson;
  const code = blibliText(json.errorCode);
  if (res.ok && json.success !== false && !code) return json;
  throw blibliError(res.status, code, blibliText(json.errorMessage) ?? '');
}

/** Error codes are public strings; the message only steers the kind. */
export function blibliError(
  status: number,
  code: string | null,
  message: string
): MarketplaceConnectorError {
  const name = code ? `BLIBLI_${code}` : `BLIBLI_HTTP_${status}`;
  if (status === 429 || /too many|rate limit|quota/i.test(message)) {
    return new MarketplaceConnectorError('rate_limited', name);
  }
  if (status >= 500) return new MarketplaceConnectorError('unavailable', name);
  if (status === 401 || status === 403 || /auth|signature|key/i.test(message)) {
    return new MarketplaceConnectorError('auth_invalid', name);
  }
  return new MarketplaceConnectorError('bad_request', name);
}

export function blibliText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
