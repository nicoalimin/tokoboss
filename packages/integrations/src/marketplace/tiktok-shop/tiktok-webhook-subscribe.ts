import {
  MarketplaceConnectorError,
  type MarketplaceConnectorContext,
} from '@tokoboss/domain';
import { tiktokFetch, tiktokUrl, type TikTokHttpDeps } from './tiktok-http';

/**
 * TikTok Shop (202309) per-shop webhook subscribe (UTA-39 / US20, RFC 04
 * task 57b). RFC: TikTok webhooks are subscribed per shop on connect, and
 * capability `webhooks` is `supported` once subscribed, else `manual`
 * (scheduled reconciliation). Story 20 only needs the two auth events.
 * TikTok takes one event type per `PUT /event/202309/webhooks` call, signed
 * with the body and sent with the seller token. Nothing secret is logged.
 */
export const TIKTOK_WEBHOOKS_PATH = '/event/202309/webhooks';
export const TIKTOK_SUBSCRIBED_EVENTS: readonly string[] = [
  'SELLER_DEAUTHORIZATION',
  'UPCOMING_AUTHORIZATION_EXPIRATION',
];

async function tiktokPutWebhook(
  deps: TikTokHttpDeps,
  accessToken: string,
  address: string,
  eventType: string
): Promise<void> {
  const body = JSON.stringify({ address, event_type: eventType });
  const url = tiktokUrl(deps, TIKTOK_WEBHOOKS_PATH, {}, body);
  const headers = new Headers({
    'content-type': 'application/json',
    'x-tts-access-token': accessToken,
  });
  await tiktokFetch(deps.fetch, url, { method: 'PUT', headers, body });
}

/**
 * True only when every event type is subscribed. A non-https address, a
 * missing token, or any TikTok error returns false (capability `manual`)
 * so connect never fails on webhooks; other errors still throw.
 */
export async function tiktokSubscribeWebhooks(
  deps: TikTokHttpDeps,
  ctx: MarketplaceConnectorContext,
  address: string
): Promise<boolean> {
  const accessToken = ctx.credentials.secrets.access_token;
  if (!accessToken || !address.startsWith('https://')) return false;
  try {
    for (const eventType of TIKTOK_SUBSCRIBED_EVENTS) {
      await tiktokPutWebhook(deps, accessToken, address, eventType);
    }
    return true;
  } catch (error) {
    if (error instanceof MarketplaceConnectorError) return false;
    throw error;
  }
}
