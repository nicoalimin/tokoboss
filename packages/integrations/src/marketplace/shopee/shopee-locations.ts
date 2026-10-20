import {
  MarketplaceConnectorError,
  type MarketplaceConnectorContext,
  type MarketplaceLocation,
} from '@tokoboss/domain';
import { shopeeText, type ShopeeHttpDeps } from './shopee-http';
import { shopeeGet, shopeeObject } from './shopee-query';
import { shopeeShopScope } from './shopee-shop-info';

/**
 * Shopee v2 seller warehouses (UTA-39 / US20, RFC 04 task 51f). Reads
 * `get_warehouse_detail`; each warehouse becomes one location keyed by
 * its Shopee `location_id`, so stock can later be linked to a TokoBoss
 * warehouse. Shops without multi-warehouse answer with a warehouse error
 * and read as no locations. Addresses are dropped; nothing secret is
 * logged.
 */
export async function shopeeLocations(
  deps: ShopeeHttpDeps,
  ctx: MarketplaceConnectorContext
): Promise<readonly MarketplaceLocation[]> {
  const path = '/api/v2/shop/get_warehouse_detail';
  let response: unknown;
  try {
    const json = await shopeeGet(deps, path, shopeeShopScope(ctx), {});
    response = json.response;
  } catch (err) {
    if (shopeeNoWarehouses(err)) return [];
    throw err;
  }
  const locations: MarketplaceLocation[] = [];
  const seen = new Set<string>();
  for (const value of Array.isArray(response) ? response : []) {
    const row = shopeeObject(value);
    const id = row ? shopeeText(row.location_id) : null;
    if (!row || !id || seen.has(id)) continue;
    seen.add(id);
    locations.push({
      externalLocationId: id,
      name: shopeeText(row.warehouse_name),
    });
  }
  return locations;
}

/** Single-warehouse shops get a `bad_request` that names the warehouse. */
export function shopeeNoWarehouses(err: unknown): boolean {
  return (
    err instanceof MarketplaceConnectorError &&
    err.kind === 'bad_request' &&
    /warehouse/i.test(err.message)
  );
}
