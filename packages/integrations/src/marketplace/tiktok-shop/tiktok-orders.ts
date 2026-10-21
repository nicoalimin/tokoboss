import type {
  MarketplaceConnectorContext,
  MarketplaceOrderPreviewRow,
} from '@tokoboss/domain';
import {
  tiktokText,
  type TikTokHttpDeps,
  type TikTokJson,
} from './tiktok-http';
import { tiktokOrderRows, type TikTokOrderWindow } from './tiktok-order-search';
import { tiktokNumber, tiktokObject, tiktokRows } from './tiktok-query';

/**
 * TikTok Shop (202309) recent orders preview (UTA-39 / US20, RFC 04 task
 * 56g). Maps the raw orders from 56f into PII-free preview rows: status,
 * create time, line count and total. Only those fields are read; buyer,
 * recipient address and payment method data are never kept.
 */

/** TikTok money is a major-unit string (IDR); the app stores minor units. */
export function tiktokCents(value: unknown): number | null {
  const amount = tiktokNumber(value);
  return amount === null || amount < 0 ? null : Math.round(amount * 100);
}

/** Preview row from one order; null when the order has no id. */
export function tiktokOrderRow(
  order: TikTokJson
): MarketplaceOrderPreviewRow | null {
  const externalOrderId = tiktokText(order.id);
  if (!externalOrderId) return null;
  const created = tiktokNumber(order.create_time);
  const payment = tiktokObject(order.payment);
  return {
    externalOrderId,
    providerStatus: tiktokText(order.status),
    orderedAt:
      created !== null && created > 0 ? new Date(created * 1000) : null,
    lineCount: tiktokRows(order, 'line_items').length,
    totalCents: tiktokCents(payment?.total_amount),
  };
}

/** Recent orders newest first, at most `window.limit` (≤ 50) rows. */
export async function tiktokRecentOrders(
  deps: TikTokHttpDeps,
  ctx: MarketplaceConnectorContext,
  window: TikTokOrderWindow
): Promise<MarketplaceOrderPreviewRow[]> {
  const orders = await tiktokOrderRows(deps, ctx, window);
  const rows: MarketplaceOrderPreviewRow[] = [];
  for (const order of orders) {
    const row = tiktokOrderRow(order);
    if (row) rows.push(row);
  }
  return rows;
}
