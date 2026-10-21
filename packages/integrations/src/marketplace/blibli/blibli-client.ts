import { createHash, createHmac } from 'node:crypto';

/**
 * Blibli Seller API client basics (UTA-39 / US20, RFC 04 task 59): base
 * URLs, partner Basic auth, seller headers, and the request signature.
 * Mirrors Blibli's official seller-api-client (basic auth). Stdlib only;
 * never logs the client key, seller key or signature key.
 */
export const BLIBLI_BASE_URL = {
  uat: 'https://api-uata.gdn-app.com/v2/proxy',
  production: 'https://api.blibli.com/v2/proxy',
} as const;

/** TokoBoss's own API client (partner) settings. */
export interface BlibliPartnerConfig {
  readonly env: keyof typeof BLIBLI_BASE_URL;
  readonly clientId: string;
  readonly clientKey: string;
  readonly channelId: string; // platform name, e.g. `tokoboss`
}

/** One seller's binding, from the Blibli key form (sealed at rest). */
export interface BlibliSellerKeys {
  readonly merchantCode: string;
  readonly apiSellerKey: string;
  readonly signatureKey: string;
}

export interface BlibliRequestInput {
  readonly method: 'GET' | 'POST';
  /** Path after `/proxy`, e.g. `/mta/api/businesspartner/v2/...`. */
  readonly path: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly now: Date;
  readonly requestId: string;
}

const JSON_TYPE = 'application/json';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** `EEE MMM dd HH:mm:ss WIB yyyy` in Asia/Jakarta (UTC+7, no DST). */
export function blibliDate(at: Date): string {
  const d = new Date(Math.floor(at.getTime() / 1000) * 1000 + WIB_OFFSET_MS);
  const two = (n: number) => String(n).padStart(2, '0');
  const time = `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`;
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${two(d.getUTCDate())} ${time} WIB ${d.getUTCFullYear()}`;
}

/** base64(HMAC-SHA256(signatureKey, method\nmd5(body)\ntype\ndate\npath)). */
export function blibliSignature(
  signatureKey: string,
  input: Pick<BlibliRequestInput, 'method' | 'path' | 'body' | 'now'>
): string {
  const body = (input.body ?? '').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  const md5 = body ? createHash('md5').update(body, 'utf8').digest('hex') : '';
  const path = input.path.replace(/^\/mta\//, '/mtaapi/');
  const head = [input.method, md5, body ? JSON_TYPE : ''];
  const raw = [...head, blibliDate(input.now), path].join('\n');
  const mac = createHmac('sha256', signatureKey).update(raw, 'utf8');
  return mac.digest('base64');
}

/** Builds the URL and headers of one signed call; the caller fetches. */
export function blibliRequest(
  partner: BlibliPartnerConfig,
  seller: BlibliSellerKeys,
  input: BlibliRequestInput
): { url: URL; init: RequestInit } {
  if (!partner.clientId || !partner.clientKey || !seller.apiSellerKey) {
    throw new Error('BLIBLI_CLIENT_CONFIG_INVALID');
  }
  const url = new URL(`${BLIBLI_BASE_URL[partner.env]}${input.path}`);
  const params: Record<string, string> = {
    storeId: '10001',
    businessPartnerCode: seller.merchantCode,
    merchantCode: seller.merchantCode,
    storeCode: seller.merchantCode,
    channelId: partner.channelId,
    requestId: input.requestId,
    ...input.query,
  };
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  const basic = Buffer.from(`${partner.clientId}:${partner.clientKey}`, 'utf8');
  const headers = new Headers({
    accept: JSON_TYPE,
    'content-type': JSON_TYPE,
    authorization: `Basic ${basic.toString('base64')}`,
    'api-seller-key': seller.apiSellerKey,
  });
  if (seller.signatureKey) {
    headers.set('signature', blibliSignature(seller.signatureKey, input));
    headers.set('signature-time', String(input.now.getTime()));
  }
  const init: RequestInit = { method: input.method, headers };
  if (input.body) init.body = input.body;
  return { url, init };
}
