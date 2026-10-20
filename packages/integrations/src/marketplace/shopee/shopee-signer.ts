import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Shopee Open Platform v2 signer (UTA-39 / US20, RFC 04 task 49).
 * Stdlib only (node:crypto). Signs API requests and verifies push
 * `Authorization` headers with a constant-time compare. Never logs or
 * echoes the partner key, access tokens, or computed signatures.
 */
export interface ShopeeSignerConfig {
  readonly partnerId: number;
  readonly partnerKey: string;
}

/** Who a call acts for: the partner only, one shop, or a main account. */
export type ShopeeSignScope =
  | { readonly kind: 'public' }
  | {
      readonly kind: 'shop';
      readonly accessToken: string;
      readonly shopId: number;
    }
  | {
      readonly kind: 'merchant';
      readonly accessToken: string;
      readonly merchantId: number;
    };

/** Query params every signed Shopee v2 call carries. */
export type ShopeeSignedParams = Readonly<Record<string, string>>;

const HEX_SHA256 = /^[0-9a-f]{64}$/;

export function hmacSha256Hex(key: string, message: string): string {
  return createHmac('sha256', key).update(message, 'utf8').digest('hex');
}

/** Constant-time compare of two lowercase SHA-256 hex digests. */
export function hexDigestEquals(expected: string, actual: string): boolean {
  const given = actual.trim().toLowerCase();
  if (!HEX_SHA256.test(expected) || !HEX_SHA256.test(given)) return false;
  return timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(given, 'hex')
  );
}

export class ShopeeSigner {
  constructor(private readonly config: ShopeeSignerConfig) {
    const { partnerId, partnerKey } = config;
    if (!Number.isSafeInteger(partnerId) || partnerId <= 0 || !partnerKey) {
      throw new Error('SHOPEE_SIGNER_CONFIG_INVALID');
    }
  }

  /** partner_id + path + timestamp [+ access_token + shop_id|merchant_id]. */
  baseString(path: string, now: Date, scope: ShopeeSignScope): string {
    const head = `${this.config.partnerId}${path}${toTimestamp(now)}`;
    if (scope.kind === 'public') return head;
    const owner = scope.kind === 'shop' ? scope.shopId : scope.merchantId;
    return `${head}${scope.accessToken}${owner}`;
  }

  sign(path: string, now: Date, scope: ShopeeSignScope): string {
    return hmacSha256Hex(
      this.config.partnerKey,
      this.baseString(path, now, scope)
    );
  }

  signedParams(
    path: string,
    now: Date,
    scope: ShopeeSignScope
  ): ShopeeSignedParams {
    const params: Record<string, string> = {
      partner_id: String(this.config.partnerId),
      timestamp: String(toTimestamp(now)),
      sign: this.sign(path, now, scope),
    };
    if (scope.kind === 'shop') {
      params.access_token = scope.accessToken;
      params.shop_id = String(scope.shopId);
    } else if (scope.kind === 'merchant') {
      params.access_token = scope.accessToken;
      params.merchant_id = String(scope.merchantId);
    }
    return params;
  }

  /** Push check: Authorization = HMAC-SHA256(partner_key, url + "|" + body). */
  verifyPush(url: string, rawBody: string, authorization?: string): boolean {
    if (!authorization) return false;
    const expected = hmacSha256Hex(this.config.partnerKey, `${url}|${rawBody}`);
    return hexDigestEquals(expected, authorization);
  }
}

function toTimestamp(now: Date): number {
  return Math.floor(now.getTime() / 1000);
}
