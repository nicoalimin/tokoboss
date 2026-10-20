import {
  MarketplaceConnectorError,
  type MarketplaceConnectorContext,
} from '@tokoboss/domain';
import { shopeeText, type ShopeeHttpDeps } from './shopee-http';
import { shopeeGet, shopeeResponse, shopeeRows } from './shopee-query';
import { shopeeShopScope } from './shopee-shop-info';

/**
 * Shopee v2 recent order numbers (UTA-39 / US20, RFC 04 task 51g). Walks
 * `get_order_list` by create time over the preview window so the order
 * detail slice can build PII-free preview rows. Shopee caps one query at
 * 15 days; only order numbers and status are read, never buyer data.
 */
export const SHOPEE_ORDER_MAX_DAYS = 15;
export const SHOPEE_ORDER_MAX_ROWS = 50;
const SHOPEE_ORDER_MAX_PAGES = 5;
const DAY_SECONDS = 86_400;

export interface ShopeeOrderWindow {
  readonly days: number;
  readonly limit: number;
}

export interface ShopeeOrderRef {
  readonly orderSn: string;
  readonly status: string | null;
}

/** Unix-second range ending now; days 1–15 and limit 1–50 only. */
export function shopeeOrderRange(
  now: Date,
  window: ShopeeOrderWindow
): { readonly from: number; readonly to: number } {
  const { days, limit } = window;
  const okDays =
    Number.isInteger(days) && days >= 1 && days <= SHOPEE_ORDER_MAX_DAYS;
  const okLimit =
    Number.isInteger(limit) && limit >= 1 && limit <= SHOPEE_ORDER_MAX_ROWS;
  if (!okDays || !okLimit) {
    throw new MarketplaceConnectorError('bad_request', 'SHOPEE_ORDER_WINDOW');
  }
  const to = Math.floor(now.getTime() / 1000);
  return { from: to - days * DAY_SECONDS, to };
}

/** Up to `limit` order numbers in Shopee's order; repeats kept once. */
export async function shopeeOrderRefs(
  deps: ShopeeHttpDeps,
  ctx: MarketplaceConnectorContext,
  window: ShopeeOrderWindow
): Promise<ShopeeOrderRef[]> {
  const { from, to } = shopeeOrderRange(deps.now(), window);
  const path = '/api/v2/order/get_order_list';
  const refs: ShopeeOrderRef[] = [];
  const seen = new Set<string>();
  let cursor = '';
  for (let page = 0; page < SHOPEE_ORDER_MAX_PAGES; page += 1) {
    const json = await shopeeGet(deps, path, shopeeShopScope(ctx), {
      time_range_field: 'create_time',
      time_from: from,
      time_to: to,
      page_size: window.limit,
      cursor,
      response_optional_fields: 'order_status',
    });
    const body = shopeeResponse(json);
    for (const row of shopeeRows(body, 'order_list')) {
      const orderSn = shopeeText(row.order_sn);
      if (!orderSn || seen.has(orderSn)) continue;
      seen.add(orderSn);
      refs.push({ orderSn, status: shopeeText(row.order_status) });
      if (refs.length >= window.limit) return refs;
    }
    const next = shopeeText(body.next_cursor);
    if (body.more !== true || !next || next === cursor) break;
    cursor = next;
  }
  return refs;
}
