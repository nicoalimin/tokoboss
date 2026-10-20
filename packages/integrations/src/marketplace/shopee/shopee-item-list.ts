import {
  MarketplaceConnectorError,
  type MarketplaceConnectorContext,
} from '@tokoboss/domain';
import type { ShopeeHttpDeps } from './shopee-http';
import {
  shopeeGet,
  shopeeNumber,
  shopeeResponse,
  shopeeRows,
} from './shopee-query';
import { shopeeShopScope } from './shopee-shop-info';

/**
 * Shopee v2 item ID pages (UTA-39 / US20, RFC 04 task 51b). Walks
 * `get_item_list` with an offset cursor over live and unlisted items so
 * the listings import can fetch base info and models per page. Deleted
 * and banned items are not requested. Nothing secret is logged.
 */
export const SHOPEE_ITEM_PAGE_SIZE = 50;
export const SHOPEE_ITEM_STATUSES: readonly string[] = ['NORMAL', 'UNLIST'];

export interface ShopeeItemIdPage {
  readonly itemIds: readonly string[];
  readonly nextCursor: string | null;
}

/** The cursor is the decimal `next_offset`; null starts at offset 0. */
export function shopeeItemOffset(cursor: string | null): number {
  if (cursor === null) return 0;
  if (!/^\d{1,9}$/.test(cursor)) {
    throw new MarketplaceConnectorError('bad_request', 'SHOPEE_BAD_CURSOR');
  }
  return Number(cursor);
}

/** One page of item IDs; a stalled or missing offset ends the walk. */
export async function shopeeItemIdPage(
  deps: ShopeeHttpDeps,
  ctx: MarketplaceConnectorContext,
  cursor: string | null
): Promise<ShopeeItemIdPage> {
  const offset = shopeeItemOffset(cursor);
  const path = '/api/v2/product/get_item_list';
  const json = await shopeeGet(deps, path, shopeeShopScope(ctx), {
    offset,
    page_size: SHOPEE_ITEM_PAGE_SIZE,
    item_status: SHOPEE_ITEM_STATUSES,
  });
  const body = shopeeResponse(json);
  const itemIds: string[] = [];
  for (const row of shopeeRows(body, 'item')) {
    const id = shopeeNumber(row.item_id);
    if (id !== null && id > 0) itemIds.push(String(id));
  }
  const next = shopeeNumber(body.next_offset);
  const more = body.has_next_page === true && next !== null && next > offset;
  return { itemIds, nextCursor: more ? String(next) : null };
}
