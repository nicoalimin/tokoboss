import type {
  MarketplaceConnectorContext,
  MarketplaceLocation,
} from '@tokoboss/domain';
import { tiktokText, type TikTokHttpDeps } from './tiktok-http';
import { tiktokRows, tiktokShopCall } from './tiktok-query';

/**
 * TikTok Shop (202309) seller warehouses (UTA-39 / US20, RFC 04 task 56e).
 * Reads `GET /logistics/202309/warehouses`; each sales warehouse becomes
 * one location keyed by its TikTok warehouse `id`, so stock can later be
 * linked to a TokoBoss warehouse. Return-only warehouses hold no sellable
 * stock and are skipped. Addresses are dropped; nothing secret is logged.
 */
export const TIKTOK_WAREHOUSES_PATH = '/logistics/202309/warehouses';
export const TIKTOK_SKIPPED_WAREHOUSE_TYPES: readonly string[] = [
  'RETURN_WAREHOUSE',
];

export async function tiktokWarehouses(
  deps: TikTokHttpDeps,
  ctx: MarketplaceConnectorContext
): Promise<readonly MarketplaceLocation[]> {
  const data = await tiktokShopCall(deps, ctx, TIKTOK_WAREHOUSES_PATH);
  const locations: MarketplaceLocation[] = [];
  const seen = new Set<string>();
  for (const row of tiktokRows(data, 'warehouses')) {
    const id = tiktokText(row.id);
    if (!id || seen.has(id)) continue;
    const type = tiktokText(row.type);
    if (type && TIKTOK_SKIPPED_WAREHOUSE_TYPES.includes(type)) continue;
    seen.add(id);
    locations.push({ externalLocationId: id, name: tiktokText(row.name) });
  }
  return locations;
}
