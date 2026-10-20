import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * TikTok Shop Partner API (202309) signer (UTA-39 / US20, RFC 04 task 54).
 * Stdlib only (node:crypto). Signs API requests and verifies webhook
 * `Authorization` headers with a constant-time compare. Never logs or
 * echoes the app secret, access tokens, or computed signatures.
 */
export interface TikTokSignerConfig {
  readonly appKey: string;
  readonly appSecret: string;
}

/** Query params of one TikTok Shop call (values already stringified). */
export type TikTokQuery = Readonly<Record<string, string>>;

/** Params the signature never covers (the token travels in a header). */
const UNSIGNED = new Set(['sign', 'access_token']);
const HEX_SHA256 = /^[0-9a-f]{64}$/;

export class TikTokSigner {
  constructor(private readonly config: TikTokSignerConfig) {
    if (!config.appKey || !config.appSecret) {
      throw new Error('TIKTOK_SIGNER_CONFIG_INVALID');
    }
  }

  /**
   * path + key/value pairs sorted by key (minus sign, access_token) + body.
   * Pass an empty body for GET and multipart uploads.
   */
  baseString(path: string, query: TikTokQuery, body = ''): string {
    const pairs = Object.keys(query)
      .filter((key) => !UNSIGNED.has(key))
      .sort()
      .map((key) => `${key}${query[key]}`)
      .join('');
    return `${path}${pairs}${body}`;
  }

  /** HMAC-SHA256(app_secret, secret + base + secret), lowercase hex. */
  sign(path: string, query: TikTokQuery, body = ''): string {
    const { appSecret } = this.config;
    const base = this.baseString(path, query, body);
    return hmacSha256Hex(appSecret, `${appSecret}${base}${appSecret}`);
  }

  /** Query for a signed call: extras plus app_key, timestamp and sign. */
  signedQuery(
    path: string,
    now: Date,
    extra: TikTokQuery = {},
    body = ''
  ): TikTokQuery {
    const query: Record<string, string> = {
      ...extra,
      app_key: this.config.appKey,
      timestamp: String(Math.floor(now.getTime() / 1000)),
    };
    return { ...query, sign: this.sign(path, query, body) };
  }

  /** Webhook check: Authorization = HMAC-SHA256(app_secret, app_key + body). */
  verifyWebhook(rawBody: string, authorization?: string): boolean {
    if (!authorization) return false;
    const { appKey, appSecret } = this.config;
    const expected = hmacSha256Hex(appSecret, `${appKey}${rawBody}`);
    const given = authorization.trim().toLowerCase();
    if (!HEX_SHA256.test(given)) return false;
    return timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(given, 'hex')
    );
  }
}

function hmacSha256Hex(key: string, message: string): string {
  return createHmac('sha256', key).update(message, 'utf8').digest('hex');
}
