import {
  MarketplaceConnectorError,
  type MarketplaceConnectorContext,
  type MarketplaceStockPushInput,
  type MarketplaceStockPushResult,
} from '@tokoboss/domain';
import type { TikTokHttpDeps } from './tiktok-http';
import { tiktokRows, tiktokShopCall } from './tiktok-query';

/**
 * TikTok Shop (202309) absolute stock push (UTA-37 / US04, RFC 06 task 10).
 * One `POST /product/202309/products/{product_id}/inventory/update` per
 * Store SKU: `product_id` from `externalItemId`, `skus[0].id` from
 * `platformSkuId` and one `{ warehouse_id, available_stock }` entry per
 * target. TikTok needs an explicit warehouse, so a target without
 * `externalLocationId` fails before any call. A non-empty `data.errors`
 * fails the whole push. Never a delta; nothing secret is logged.
 */
export const TIKTOK_INVENTORY_PATH_PREFIX = '/product/202309/products/';

export function tiktokInventoryPath(productId: string): string {
  return `${TIKTOK_INVENTORY_PATH_PREFIX}${encodeURIComponent(productId)}/inventory/update`;
}

export async function tiktokPushInventory(
  deps: TikTokHttpDeps,
  ctx: MarketplaceConnectorContext,
  input: MarketplaceStockPushInput
): Promise<MarketplaceStockPushResult> {
  if (!input.externalItemId || !input.platformSkuId) {
    throw new MarketplaceConnectorError('bad_request', 'TIKTOK_SKU_INVALID');
  }
  const valid = input.targets.every(
    (t) => Number.isSafeInteger(t.quantity) && t.quantity >= 0
  );
  if (input.targets.length === 0 || !valid) {
    throw new MarketplaceConnectorError('bad_request', 'TIKTOK_STOCK_INVALID');
  }
  const inventory = input.targets.map((t) => {
    if (!t.externalLocationId) {
      throw new MarketplaceConnectorError(
        'bad_request',
        'TIKTOK_WAREHOUSE_REQUIRED'
      );
    }
    return { warehouse_id: t.externalLocationId, available_stock: t.quantity };
  });
  const path = tiktokInventoryPath(input.externalItemId);
  const body = { skus: [{ id: input.platformSkuId, inventory }] };
  const data = await tiktokShopCall(deps, ctx, path, {}, body);
  if (tiktokRows(data, 'errors').length > 0) {
    throw new MarketplaceConnectorError(
      'bad_request',
      'TIKTOK_INVENTORY_REJECTED'
    );
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
