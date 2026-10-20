import type { MarketplaceConnectorContext } from '@tokoboss/domain';
import { tiktokText, type TikTokHttpDeps } from './tiktok-http';
import {
  tiktokNextCursor,
  tiktokPageQuery,
  tiktokRows,
  tiktokShopCall,
} from './tiktok-query';

/**
 * TikTok Shop (202309) product search pages (UTA-39 / US20, RFC 04 task
 * 56b). Walks `POST /product/202309/products/search` with the opaque
 * `page_token` cursor so the listings import can fetch SKU rows per
 * product (56c). Deleted products are skipped; a repeated cursor ends the
 * walk. Nothing secret is logged.
 */
export const TIKTOK_PRODUCT_PAGE_SIZE = 50;
export const TIKTOK_PRODUCT_SEARCH_PATH = '/product/202309/products/search';
export const TIKTOK_SKIPPED_PRODUCT_STATUSES: readonly string[] = ['DELETED'];

export interface TikTokProductSummary {
  readonly productId: string;
  readonly title: string | null;
  readonly status: string | null;
}

export interface TikTokProductPage {
  readonly products: readonly TikTokProductSummary[];
  readonly nextCursor: string | null;
}

/** One page of products in TikTok's order; junk and duplicate IDs dropped. */
export async function tiktokProductPage(
  deps: TikTokHttpDeps,
  ctx: MarketplaceConnectorContext,
  cursor: string | null
): Promise<TikTokProductPage> {
  const data = await tiktokShopCall(
    deps,
    ctx,
    TIKTOK_PRODUCT_SEARCH_PATH,
    tiktokPageQuery(TIKTOK_PRODUCT_PAGE_SIZE, cursor),
    { status: 'ALL' }
  );
  const seen = new Set<string>();
  const products: TikTokProductSummary[] = [];
  for (const row of tiktokRows(data, 'products')) {
    const productId = tiktokText(row.id);
    if (!productId || seen.has(productId)) continue;
    const status = tiktokText(row.status);
    if (status && TIKTOK_SKIPPED_PRODUCT_STATUSES.includes(status)) continue;
    seen.add(productId);
    products.push({ productId, title: tiktokText(row.title), status });
  }
  const next = tiktokNextCursor(data);
  return {
    products,
    nextCursor: next !== null && next !== cursor ? next : null,
  };
}
