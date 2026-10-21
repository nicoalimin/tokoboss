import { createHash } from 'node:crypto';
import type {
  MarketplaceWebhookEvent,
  MarketplaceWebhookRequest,
} from '@tokoboss/domain';
import { tiktokText, type TikTokJson } from './tiktok-http';
import { tiktokNumber, tiktokObject } from './tiktok-query';
import type { TikTokSigner } from './tiktok-signer';

/**
 * TikTok Shop (202309) webhook intake (UTA-39 / US20, RFC 04 task 57a).
 * Verifies the `Authorization` header (HMAC-SHA256(app_secret, app_key +
 * body), constant-time, via the 54 signer) and turns one notification into
 * a normalized event. Type 6 (seller deauthorization) and type 7
 * (authorization expiry) map to the Story 20 types; every other type is
 * kept as `TIKTOK_WEBHOOK_<type>` so the intake stores it as NOT_IN_SCOPE.
 * Nothing secret is logged.
 */
export const TIKTOK_WEBHOOK_TYPES: Readonly<Record<number, string>> = {
  6: 'SELLER_DEAUTHORIZATION',
  7: 'UPCOMING_AUTHORIZATION_EXPIRATION',
};

/** Header lookup is case-insensitive; a missing header fails closed. */
export function tiktokVerifyWebhook(
  signer: TikTokSigner,
  request: MarketplaceWebhookRequest
): boolean {
  const entry = Object.entries(request.headers).find(
    ([name]) => name.toLowerCase() === 'authorization'
  );
  return signer.verifyWebhook(request.rawBody, entry?.[1]);
}

/**
 * Dedupe on `tts_notification_id`; when it is missing, the raw-body hash
 * (TikTok resends the same body on retry) keeps duplicates out.
 */
export function tiktokParseWebhook(rawBody: string): MarketplaceWebhookEvent[] {
  let body: TikTokJson | null;
  try {
    body = tiktokObject(JSON.parse(rawBody));
  } catch {
    return [];
  }
  const type = tiktokNumber(body?.type);
  if (!body || type === null) return [];
  const id = tiktokText(body.tts_notification_id);
  const hash = createHash('sha256').update(rawBody).digest('hex');
  return [
    {
      dedupeKey: `tiktok:${id ?? hash}`,
      eventType: TIKTOK_WEBHOOK_TYPES[type] ?? `TIKTOK_WEBHOOK_${type}`,
      providerStoreId: tiktokText(body.shop_id),
      payload: body,
    },
  ];
}
