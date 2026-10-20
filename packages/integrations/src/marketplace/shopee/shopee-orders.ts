import type {
  MarketplaceConnectorContext,
  MarketplaceOrderPreviewRow,
} from '@tokoboss/domain';
import {
  shopeeText,
  type ShopeeHttpDeps,
  type ShopeeJson,
} from './shopee-http';
import {
  shopeeOrderRefs,
  type ShopeeOrderRef,
  type ShopeeOrderWindow,
} from './shopee-order-list';
import {
  shopeeGet,
  shopeeNumber,
  shopeeResponse,
  shopeeRows,
} from './shopee-query';
import { shopeeShopScope } from './shopee-shop-info';

/**
 * Shopee v2 recent orders preview (UTA-39 / US20, RFC 04 task 51h). One
 * `get_order_detail` call for the order numbers from 51g turns them into
 * PII-free preview rows: status, create time, line count and total. Only
 * those fields are read; buyer, address and payment data are never kept.
 */

/** Shopee money is in major units (IDR); the app stores minor units. */
export function shopeeCents(value: unknown): number | null {
  const amount = shopeeNumber(value);
  return amount === null || amount < 0 ? null : Math.round(amount * 100);
}

/** Preview row from one detail row; a missing detail keeps the ref only. */
export function shopeeOrderRow(
  ref: ShopeeOrderRef,
  detail: ShopeeJson | undefined
): MarketplaceOrderPreviewRow {
  const created = shopeeNumber(detail?.create_time);
  return {
    externalOrderId: ref.orderSn,
    providerStatus: shopeeText(detail?.order_status) ?? ref.status,
    orderedAt:
      created !== null && created > 0 ? new Date(created * 1000) : null,
    lineCount: detail ? shopeeRows(detail, 'item_list').length : 0,
    totalCents: shopeeCents(detail?.total_amount),
  };
}

/** Recent orders in Shopee's order, at most `window.limit` (≤ 50) rows. */
export async function shopeeRecentOrders(
  deps: ShopeeHttpDeps,
  ctx: MarketplaceConnectorContext,
  window: ShopeeOrderWindow
): Promise<MarketplaceOrderPreviewRow[]> {
  const refs = await shopeeOrderRefs(deps, ctx, window);
  if (refs.length === 0) return [];
  const path = '/api/v2/order/get_order_detail';
  const json = await shopeeGet(deps, path, shopeeShopScope(ctx), {
    order_sn_list: refs.map((ref) => ref.orderSn).join(','),
    response_optional_fields: 'item_list,total_amount',
  });
  const details = new Map<string, ShopeeJson>();
  for (const row of shopeeRows(shopeeResponse(json), 'order_list')) {
    const orderSn = shopeeText(row.order_sn);
    if (orderSn && !details.has(orderSn)) details.set(orderSn, row);
  }
  return refs.map((ref) => shopeeOrderRow(ref, details.get(ref.orderSn)));
}
