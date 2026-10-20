import type {
  MarketplaceConnectorContext,
  MarketplaceListingPage,
  MarketplaceListingRow,
} from '@tokoboss/domain';
import type { ShopeeHttpDeps } from './shopee-http';
import { shopeeItemBases, shopeeItemRow } from './shopee-item-base';
import { shopeeItemIdPage } from './shopee-item-list';
import { shopeeModelRows } from './shopee-item-models';

/**
 * Shopee v2 listings page (UTA-39 / US20, RFC 04 task 51e). One page of
 * item IDs (51b) → one base-info batch (51c) → model rows for items with
 * variants (51d), in Shopee's order. Model calls run one at a time so a
 * page stays inside Shopee's per-shop rate limit; a provider error fails
 * the whole page so the import step can retry it with the same cursor.
 * Nothing secret is logged.
 */
export async function shopeeListingsPage(
  deps: ShopeeHttpDeps,
  ctx: MarketplaceConnectorContext,
  cursor: string | null
): Promise<MarketplaceListingPage> {
  const page = await shopeeItemIdPage(deps, ctx, cursor);
  const items = await shopeeItemBases(deps, ctx, page.itemIds);
  const rows: MarketplaceListingRow[] = [];
  for (const item of items) {
    if (item.hasModel) {
      rows.push(...(await shopeeModelRows(deps, ctx, item)));
    } else {
      rows.push(shopeeItemRow(item));
    }
  }
  return { rows, nextCursor: page.nextCursor };
}
