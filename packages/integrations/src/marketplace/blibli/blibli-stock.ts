import {
  MarketplaceConnectorError,
  type MarketplaceConnectorContext,
  type MarketplaceStockPushInput,
  type MarketplaceStockPushResult,
} from '@tokoboss/domain';
import { blibliCall, type BlibliHttpDeps } from './blibli-http';

/**
 * Blibli absolute stock push (UTA-37 / US04, RFC 06 task 12). One
 * `POST /mta/api/businesspartner/v1/product/updateStock` per Store SKU:
 * `gdnSku` from `platformSkuId`, one `stockList` entry per target with the
 * absolute `availableStock` and `pickupPointCode` only when the target
 * names one. Never sends `deltaStock`. HTTP/envelope errors come from
 * `blibliCall`; nothing secret is logged.
 */
export const BLIBLI_UPDATE_STOCK_PATH =
  '/mta/api/businesspartner/v1/product/updateStock';

export async function blibliPushInventory(
  deps: BlibliHttpDeps,
  ctx: MarketplaceConnectorContext,
  input: MarketplaceStockPushInput
): Promise<MarketplaceStockPushResult> {
  const gdnSku = input.platformSkuId;
  if (!gdnSku) {
    throw new MarketplaceConnectorError('bad_request', 'BLIBLI_SKU_INVALID');
  }
  const valid = input.targets.every(
    (t) => Number.isSafeInteger(t.quantity) && t.quantity >= 0
  );
  if (input.targets.length === 0 || !valid) {
    throw new MarketplaceConnectorError('bad_request', 'BLIBLI_STOCK_INVALID');
  }
  const stockList = input.targets.map((t) => ({
    gdnSku,
    availableStock: t.quantity,
    ...(t.externalLocationId ? { pickupPointCode: t.externalLocationId } : {}),
  }));
  await blibliCall(deps, ctx, {
    method: 'POST',
    path: BLIBLI_UPDATE_STOCK_PATH,
    body: { stockList },
  });
  const targets = input.targets.map((target) => ({
    ...target,
    success: true,
    errorKind: null,
    errorCode: null,
  }));
  const pushedQty = input.targets.reduce((sum, t) => sum + t.quantity, 0);
  return { pushedQty, targets };
}
