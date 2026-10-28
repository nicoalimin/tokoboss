import {
  MarketplaceConnectorError,
  type MarketplaceConnectorContext,
  type MarketplaceStockPushInput,
  type MarketplaceStockPushResult,
} from '@tokoboss/domain';
import { shopeeCall, shopeeId, type ShopeeHttpDeps } from './shopee-http';
import { shopeeResponse, shopeeRows } from './shopee-query';
import { shopeeShopScope } from './shopee-shop-info';

/**
 * Shopee v2 absolute stock push (UTA-37 / US04, RFC 06 task 8). One
 * `POST /api/v2/product/update_stock` per Store SKU: `item_id` from
 * `externalItemId`, `model_id` from `platformSkuId` (`item_id:model_id`,
 * `0` for an item without variants) and one `seller_stock` entry per
 * target (`location_id` only when the target names one). A non-empty
 * `failure_list` fails the whole push. Never a delta; nothing secret is
 * logged.
 */
export interface ShopeeStockIds {
  readonly itemId: number;
  readonly modelId: number;
}

/** `123` + `123:456` → { 123, 456 }; `123:0` is the item itself. */
export function shopeeStockIds(
  input: MarketplaceStockPushInput
): ShopeeStockIds {
  const itemId = shopeeId(input.externalItemId);
  const [itemPart, modelPart = '0', extra] = input.platformSkuId.split(':');
  const modelId = Number(modelPart);
  if (
    extra !== undefined ||
    itemPart !== input.externalItemId ||
    !/^\d+$/.test(modelPart) ||
    !Number.isSafeInteger(modelId)
  ) {
    throw new MarketplaceConnectorError('bad_request', 'SHOPEE_SKU_INVALID');
  }
  return { itemId, modelId };
}

export async function shopeePushInventory(
  deps: ShopeeHttpDeps,
  ctx: MarketplaceConnectorContext,
  input: MarketplaceStockPushInput
): Promise<MarketplaceStockPushResult> {
  const { itemId, modelId } = shopeeStockIds(input);
  const valid = input.targets.every(
    (t) => Number.isSafeInteger(t.quantity) && t.quantity >= 0
  );
  if (input.targets.length === 0 || !valid) {
    throw new MarketplaceConnectorError('bad_request', 'SHOPEE_STOCK_INVALID');
  }
  const sellerStock = input.targets.map((t) =>
    t.externalLocationId
      ? { location_id: t.externalLocationId, stock: t.quantity }
      : { stock: t.quantity }
  );
  const path = '/api/v2/product/update_stock';
  const json = await shopeeCall(deps, path, shopeeShopScope(ctx), {
    item_id: itemId,
    stock_list: [{ model_id: modelId, seller_stock: sellerStock }],
  });
  if (shopeeRows(shopeeResponse(json), 'failure_list').length > 0) {
    throw new MarketplaceConnectorError('bad_request', 'SHOPEE_STOCK_FAILED');
  }
  const targets = input.targets.map((target) => ({
    ...target,
    success: true,
    errorKind: null,
    errorCode: null,
  }));
  const pushedQty = input.targets.reduce((sum, t) => sum + t.quantity, 0);
  return { pushedQty, targets };
}
