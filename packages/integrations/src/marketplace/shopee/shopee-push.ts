import { createHash } from 'node:crypto';
import type {
  MarketplaceWebhookEvent,
  MarketplaceWebhookRequest,
} from '@tokoboss/domain';
import { shopeeText, type ShopeeJson } from './shopee-http';
import { shopeeNumber, shopeeObject } from './shopee-query';
import type { ShopeeSigner } from './shopee-signer';

/**
 * Shopee v2 push intake (UTA-39 / US20, RFC 04 task 52a). Verifies the
 * `Authorization` header (HMAC-SHA256 of url + "|" + body, constant-time,
 * via the 49 signer) and turns one push body into normalized events.
 * Code 2 (shop deauthorization) and code 12 (authorization expiry) map to
 * the Story 20 types; every other code is kept as `SHOPEE_PUSH_<code>`
 * so the intake stores it as NOT_IN_SCOPE. Nothing secret is logged.
 */
export const SHOPEE_PUSH_TYPES: Readonly<Record<number, string>> = {
  2: 'SELLER_DEAUTHORIZATION',
  12: 'UPCOMING_AUTHORIZATION_EXPIRATION',
};

/** Header lookup is case-insensitive; a missing header fails closed. */
export function shopeeVerifyPush(
  signer: ShopeeSigner,
  request: MarketplaceWebhookRequest
): boolean {
  const entry = Object.entries(request.headers).find(
    ([name]) => name.toLowerCase() === 'authorization'
  );
  return signer.verifyPush(request.url, request.rawBody, entry?.[1]);
}

/** Shopee resends the same body on retry, so its hash is the dedupe key. */
export function shopeeParsePush(rawBody: string): MarketplaceWebhookEvent[] {
  let body: ShopeeJson | null;
  try {
    body = shopeeObject(JSON.parse(rawBody));
  } catch {
    return [];
  }
  const code = shopeeNumber(body?.code);
  if (!body || code === null) return [];
  const eventType = SHOPEE_PUSH_TYPES[code] ?? `SHOPEE_PUSH_${code}`;
  const key = `shopee:${createHash('sha256').update(rawBody).digest('hex')}`;
  const shopIds = code === 12 ? expiringShops(body) : [shopId(body)];
  return shopIds.map((providerStoreId) => ({
    dedupeKey:
      providerStoreId && code === 12 ? `${key}:${providerStoreId}` : key,
    eventType,
    providerStoreId,
    payload: body,
  }));
}

function shopId(body: ShopeeJson): string | null {
  const id = shopeeNumber(body.shop_id);
  return id === null || id <= 0 ? null : String(id);
}

/** Code 12 lists shops in `data.shop_expire_soon`; else the top shop_id. */
function expiringShops(body: ShopeeJson): (string | null)[] {
  const data = shopeeObject(body.data);
  const list = Array.isArray(data?.shop_expire_soon)
    ? data.shop_expire_soon
    : [];
  const ids = list
    .map((value) => shopeeText(String(value)))
    .filter((id): id is string => id !== null && /^\d+$/.test(id));
  return ids.length > 0 ? [...new Set(ids)] : [shopId(body)];
}
