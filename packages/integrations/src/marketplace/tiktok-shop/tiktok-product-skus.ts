import type {
  MarketplaceConnectorContext,
  MarketplaceListingRow,
} from '@tokoboss/domain';
import { tiktokText, type TikTokHttpDeps } from './tiktok-http';
import type { TikTokProductSummary } from './tiktok-product-search';
import {
  tiktokNumber,
  tiktokObject,
  tiktokRows,
  tiktokShopCall,
} from './tiktok-query';

/**
 * TikTok Shop (202309) product SKU rows (UTA-39 / US20, RFC 04 task 56c).
 * One `GET /product/202309/products/{id}` call per product from the search
 * page (56b); each SKU becomes a listing row with `platform_sku_id =
 * sku_id`, a variant name from its sales attributes and stock summed over
 * warehouses. Nothing secret is logged.
 */
export const TIKTOK_PRODUCT_DETAIL_PATH = '/product/202309/products/';

/** "Red / XL" from `sales_attributes[].value_name`; blanks skipped. */
export function tiktokSkuVariantName(attributes: unknown): string | null {
  if (!Array.isArray(attributes)) return null;
  const parts: string[] = [];
  for (const attr of attributes) {
    const label = tiktokText(tiktokObject(attr)?.value_name);
    if (label) parts.push(label);
  }
  return parts.length > 0 ? parts.join(' / ') : null;
}

/** Stock summed over warehouse rows; no readable quantity reads as null. */
export function tiktokSkuStock(inventory: unknown): number | null {
  if (!Array.isArray(inventory)) return null;
  let total: number | null = null;
  for (const row of inventory) {
    const qty = tiktokNumber(tiktokObject(row)?.quantity);
    if (qty !== null) total = (total ?? 0) + qty;
  }
  return total;
}

/** One listing row per SKU, in TikTok's order; blank/duplicate IDs dropped. */
export async function tiktokProductSkuRows(
  deps: TikTokHttpDeps,
  ctx: MarketplaceConnectorContext,
  product: TikTokProductSummary
): Promise<MarketplaceListingRow[]> {
  const path =
    TIKTOK_PRODUCT_DETAIL_PATH + encodeURIComponent(product.productId);
  const data = await tiktokShopCall(deps, ctx, path);
  const title = tiktokText(data.title) ?? product.title;
  const status = tiktokText(data.status) ?? product.status;
  const seen = new Set<string>();
  const rows: MarketplaceListingRow[] = [];
  for (const sku of tiktokRows(data, 'skus')) {
    const skuId = tiktokText(sku.id);
    if (!skuId || seen.has(skuId)) continue;
    seen.add(skuId);
    rows.push({
      externalItemId: product.productId,
      platformSkuId: skuId,
      storeSkuText: tiktokText(sku.seller_sku),
      barcodeHint: tiktokText(tiktokObject(sku.identifier_code)?.code),
      title,
      variantName: tiktokSkuVariantName(sku.sales_attributes),
      listingStatus: status,
      providerStock: tiktokSkuStock(sku.inventory),
    });
  }
  return rows;
}
