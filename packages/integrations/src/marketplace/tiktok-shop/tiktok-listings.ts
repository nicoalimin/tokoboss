import type {
  MarketplaceConnectorContext,
  MarketplaceListingPage,
  MarketplaceListingRow,
} from '@tokoboss/domain';
import type { TikTokHttpDeps } from './tiktok-http';
import { tiktokProductPage } from './tiktok-product-search';
import { tiktokProductSkuRows } from './tiktok-product-skus';

/**
 * TikTok Shop (202309) listings page (UTA-39 / US20, RFC 04 task 56d). One
 * product search page (56b) → SKU rows per product from its detail call
 * (56c), in TikTok's order. Detail calls run one at a time so a page stays
 * inside TikTok's per-shop rate limit; a provider error fails the whole
 * page so the import step can retry it with the same cursor. Nothing
 * secret is logged.
 */
export async function tiktokListingsPage(
  deps: TikTokHttpDeps,
  ctx: MarketplaceConnectorContext,
  cursor: string | null
): Promise<MarketplaceListingPage> {
  const page = await tiktokProductPage(deps, ctx, cursor);
  const rows: MarketplaceListingRow[] = [];
  for (const product of page.products) {
    rows.push(...(await tiktokProductSkuRows(deps, ctx, product)));
  }
  return { rows, nextCursor: page.nextCursor };
}
