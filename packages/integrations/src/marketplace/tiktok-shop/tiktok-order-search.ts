import {
  MarketplaceConnectorError,
  type MarketplaceConnectorContext,
} from '@tokoboss/domain';
import {
  tiktokText,
  type TikTokHttpDeps,
  type TikTokJson,
} from './tiktok-http';
import {
  tiktokNextCursor,
  tiktokPageQuery,
  tiktokRows,
  tiktokShopCall,
} from './tiktok-query';

/**
 * TikTok Shop (202309) recent order search (UTA-39 / US20, RFC 04 task
 * 56f). Walks `POST /order/202309/orders/search` newest first over the
 * preview window so the preview slice (56g) can build PII-free rows. The
 * raw order objects are returned untouched; 56g reads only id, status,
 * create time, line items and total, never buyer or address data.
 */
export const TIKTOK_ORDER_SEARCH_PATH = '/order/202309/orders/search';
export const TIKTOK_ORDER_MAX_DAYS = 15;
export const TIKTOK_ORDER_MAX_ROWS = 50;
const TIKTOK_ORDER_MAX_PAGES = 5;
const DAY_SECONDS = 86_400;

export interface TikTokOrderWindow {
  readonly days: number;
  readonly limit: number;
}

/** Up to `limit` order objects, newest first; repeated IDs kept once. */
export async function tiktokOrderRows(
  deps: TikTokHttpDeps,
  ctx: MarketplaceConnectorContext,
  window: TikTokOrderWindow
): Promise<TikTokJson[]> {
  const { days, limit } = window;
  const okDays =
    Number.isInteger(days) && days >= 1 && days <= TIKTOK_ORDER_MAX_DAYS;
  const okLimit =
    Number.isInteger(limit) && limit >= 1 && limit <= TIKTOK_ORDER_MAX_ROWS;
  if (!okDays || !okLimit) {
    throw new MarketplaceConnectorError('bad_request', 'TIKTOK_ORDER_WINDOW');
  }
  const to = Math.floor(deps.now().getTime() / 1000);
  const body = { create_time_ge: to - days * DAY_SECONDS, create_time_lt: to };
  const orders: TikTokJson[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < TIKTOK_ORDER_MAX_PAGES; page += 1) {
    const query = {
      ...tiktokPageQuery(limit, cursor),
      sort_field: 'create_time',
      sort_order: 'DESC',
    };
    const data = await tiktokShopCall(
      deps,
      ctx,
      TIKTOK_ORDER_SEARCH_PATH,
      query,
      body
    );
    for (const row of tiktokRows(data, 'orders')) {
      const id = tiktokText(row.id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      orders.push(row);
      if (orders.length >= limit) return orders;
    }
    const next = tiktokNextCursor(data);
    if (next === null || next === cursor) break;
    cursor = next;
  }
  return orders;
}
