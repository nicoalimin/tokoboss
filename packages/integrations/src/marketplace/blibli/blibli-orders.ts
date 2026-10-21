import {
  MarketplaceConnectorError,
  type MarketplaceConnectorContext,
  type MarketplaceOrderPreviewRow,
} from '@tokoboss/domain';
import {
  blibliCall,
  blibliText,
  type BlibliHttpDeps,
  type BlibliJson,
} from './blibli-http';
import { blibliNumber } from './blibli-listings';

/**
 * Blibli recent orders preview (UTA-39 / US20, RFC 04 task 60c). Reads one
 * page of `GET /mta/api/businesspartner/v1/order/orderList` over the
 * preview window. Blibli lists order items, so rows are grouped by
 * `orderNo` into PII-free preview rows: status, order date, line count
 * and total. Buyer, address and payment data are never read. Field names
 * follow the seller-api docs and are read defensively until spike U7.
 */
export const BLIBLI_ORDER_LIST_PATH =
  '/mta/api/businesspartner/v1/order/orderList';
export const BLIBLI_ORDER_MAX_DAYS = 30;
export const BLIBLI_ORDER_MAX_ROWS = 50;
const DAY_MS = 86_400_000;

/** Blibli money is a major-unit IDR number; the app stores minor units. */
export function blibliCents(value: unknown): number | null {
  const amount = blibliNumber(value);
  return amount === null || amount < 0 ? null : Math.round(amount * 100);
}

/** Epoch milliseconds (number or numeric string) → Date; else null. */
export function blibliDate(value: unknown): Date | null {
  const ms = blibliNumber(value);
  return ms !== null && ms > 0 ? new Date(ms) : null;
}

/** Recent orders in Blibli's order, at most `window.limit` (≤ 50) rows. */
export async function blibliRecentOrders(
  deps: BlibliHttpDeps,
  ctx: MarketplaceConnectorContext,
  window: { readonly days: number; readonly limit: number }
): Promise<MarketplaceOrderPreviewRow[]> {
  const { days, limit } = window;
  const okDays =
    Number.isInteger(days) && days >= 1 && days <= BLIBLI_ORDER_MAX_DAYS;
  const okLimit =
    Number.isInteger(limit) && limit >= 1 && limit <= BLIBLI_ORDER_MAX_ROWS;
  if (!okDays || !okLimit) {
    throw new MarketplaceConnectorError('bad_request', 'BLIBLI_ORDER_WINDOW');
  }
  const to = deps.now().getTime();
  const data = await blibliCall(deps, ctx, {
    method: 'GET',
    path: BLIBLI_ORDER_LIST_PATH,
    query: {
      filterStartDate: String(to - days * DAY_MS),
      filterEndDate: String(to),
      page: '0',
      size: String(BLIBLI_ORDER_MAX_ROWS),
    },
  });
  const content = Array.isArray(data.content) ? data.content : [];
  const byOrder = new Map<string, BlibliJson[]>();
  for (const item of content) {
    if (typeof item !== 'object' || item === null) continue;
    const json = item as BlibliJson;
    const orderNo = blibliText(json.orderNo);
    if (!orderNo) continue;
    byOrder.set(orderNo, [...(byOrder.get(orderNo) ?? []), json]);
  }
  const rows: MarketplaceOrderPreviewRow[] = [];
  for (const [externalOrderId, items] of byOrder) {
    if (rows.length >= limit) break;
    const first = items[0] as BlibliJson;
    const totals = items.map((i) => blibliCents(i.totalPrice ?? i.finalPrice));
    rows.push({
      externalOrderId,
      providerStatus: blibliText(first.orderStatus),
      orderedAt: blibliDate(first.orderDate),
      lineCount: items.length,
      totalCents: totals.includes(null)
        ? null
        : totals.reduce<number>((sum, c) => sum + (c ?? 0), 0),
    });
  }
  return rows;
}
