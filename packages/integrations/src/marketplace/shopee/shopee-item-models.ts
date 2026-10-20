import type {
  MarketplaceConnectorContext,
  MarketplaceListingRow,
} from '@tokoboss/domain';
import {
  shopeeText,
  type ShopeeHttpDeps,
  type ShopeeJson,
} from './shopee-http';
import {
  shopeeGtin,
  shopeeItemRow,
  type ShopeeItemBase,
} from './shopee-item-base';
import {
  shopeeGet,
  shopeeNumber,
  shopeeObject,
  shopeeResponse,
  shopeeRows,
} from './shopee-query';
import { shopeeShopScope } from './shopee-shop-info';

/**
 * Shopee v2 model rows (UTA-39 / US20, RFC 04 task 51d). An item with
 * variants (51c `hasModel`) needs one `get_model_list` call; each model
 * becomes a listing row with `platform_sku_id = item_id:model_id` and a
 * variant name built from the item's tier options. Nothing secret is
 * logged.
 */

/** Option labels per tier, index-aligned with `tier_index`. */
export function shopeeTierOptions(body: ShopeeJson): (string | null)[][] {
  const tiers = Array.isArray(body.tier_variation) ? body.tier_variation : [];
  return tiers.map((tier: unknown) => {
    const list = shopeeObject(tier)?.option_list;
    if (!Array.isArray(list)) return [];
    return list.map((o: unknown) => shopeeText(shopeeObject(o)?.option));
  });
}

/** "Red / XL" from `tier_index` [0, 2]; unknown indexes are skipped. */
export function shopeeVariantName(
  tiers: readonly (readonly (string | null)[])[],
  tierIndex: unknown
): string | null {
  if (!Array.isArray(tierIndex)) return null;
  const parts: string[] = [];
  tierIndex.forEach((index: unknown, tier: number) => {
    const label = typeof index === 'number' ? tiers[tier]?.[index] : null;
    if (label) parts.push(label);
  });
  return parts.length > 0 ? parts.join(' / ') : null;
}

/** One row per model; an item with no usable models keeps `item_id:0`. */
export async function shopeeModelRows(
  deps: ShopeeHttpDeps,
  ctx: MarketplaceConnectorContext,
  item: ShopeeItemBase
): Promise<MarketplaceListingRow[]> {
  const path = '/api/v2/product/get_model_list';
  const json = await shopeeGet(deps, path, shopeeShopScope(ctx), {
    item_id: item.itemId,
  });
  const body = shopeeResponse(json);
  const tiers = shopeeTierOptions(body);
  const rows: MarketplaceListingRow[] = [];
  for (const model of shopeeRows(body, 'model')) {
    const id = shopeeNumber(model.model_id);
    if (id === null || id <= 0) continue;
    const stockInfo = shopeeObject(model.stock_info_v2);
    const summary = shopeeObject(stockInfo?.summary_info) ?? {};
    rows.push({
      externalItemId: item.itemId,
      platformSkuId: `${item.itemId}:${id}`,
      storeSkuText: shopeeText(model.model_sku),
      barcodeHint: shopeeGtin(model.gtin_code),
      title: item.title,
      variantName:
        shopeeVariantName(tiers, model.tier_index) ??
        shopeeText(model.model_name),
      listingStatus: shopeeText(model.model_status) ?? item.status,
      providerStock: shopeeNumber(summary.total_available_stock),
    });
  }
  return rows.length > 0 ? rows : [shopeeItemRow(item)];
}
