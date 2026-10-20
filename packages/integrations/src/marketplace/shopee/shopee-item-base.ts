import {
  MarketplaceConnectorError,
  type MarketplaceConnectorContext,
  type MarketplaceListingRow,
} from '@tokoboss/domain';
import { shopeeText, type ShopeeHttpDeps } from './shopee-http';
import { SHOPEE_ITEM_PAGE_SIZE } from './shopee-item-list';
import {
  shopeeGet,
  shopeeNumber,
  shopeeObject,
  shopeeResponse,
  shopeeRows,
} from './shopee-query';
import { shopeeShopScope } from './shopee-shop-info';

/**
 * Shopee v2 item base info (UTA-39 / US20, RFC 04 task 51c). One
 * `get_item_base_info` call per page of item IDs (51b) gives title, SKU
 * text, GTIN, status and stock. Items without variants become a listing
 * row with `platform_sku_id = item_id:0`; items with models are expanded
 * by the model slice. Nothing secret is logged.
 */
export interface ShopeeItemBase {
  readonly itemId: string;
  readonly title: string | null;
  readonly itemSku: string | null;
  readonly gtin: string | null;
  readonly status: string | null;
  readonly hasModel: boolean;
  readonly stock: number | null;
}

/** Shopee reports a missing GTIN as "00"; blank or zeros read as null. */
export function shopeeGtin(value: unknown): string | null {
  const text = shopeeText(value);
  return text && !/^0+$/.test(text) ? text : null;
}

/** Base info for up to 50 item IDs, in Shopee's order; junk rows dropped. */
export async function shopeeItemBases(
  deps: ShopeeHttpDeps,
  ctx: MarketplaceConnectorContext,
  itemIds: readonly string[]
): Promise<ShopeeItemBase[]> {
  if (itemIds.length === 0) return [];
  if (itemIds.length > SHOPEE_ITEM_PAGE_SIZE) {
    throw new MarketplaceConnectorError('bad_request', 'SHOPEE_ITEM_BATCH');
  }
  const path = '/api/v2/product/get_item_base_info';
  const json = await shopeeGet(deps, path, shopeeShopScope(ctx), {
    item_id_list: itemIds.join(','),
  });
  const items: ShopeeItemBase[] = [];
  for (const row of shopeeRows(shopeeResponse(json), 'item_list')) {
    const id = shopeeNumber(row.item_id);
    if (id === null || id <= 0) continue;
    const stockInfo = shopeeObject(row.stock_info_v2);
    const summary = shopeeObject(stockInfo?.summary_info) ?? {};
    items.push({
      itemId: String(id),
      title: shopeeText(row.item_name),
      itemSku: shopeeText(row.item_sku),
      gtin: shopeeGtin(row.gtin_code),
      status: shopeeText(row.item_status),
      hasModel: row.has_model === true,
      stock: shopeeNumber(summary.total_available_stock),
    });
  }
  return items;
}

/** Listing row for an item without variants (`model_id` 0). */
export function shopeeItemRow(item: ShopeeItemBase): MarketplaceListingRow {
  return {
    externalItemId: item.itemId,
    platformSkuId: `${item.itemId}:0`,
    storeSkuText: item.itemSku,
    barcodeHint: item.gtin,
    title: item.title,
    variantName: null,
    listingStatus: item.status,
    providerStock: item.stock,
  };
}
