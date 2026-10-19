import { ValidationError } from '../errors/domain-error';

/**
 * Marketplace connection vocabulary (UTA-39 / US20, RFC 04 task 10).
 *
 * Pure types and builders shared by the connector port, application use
 * cases and Drizzle stores. Values match the text columns in migration
 * 0020 (`marketplace_connections`, `marketplace_listings`).
 */
export const MARKETPLACE_PROVIDERS = [
  'shopee',
  'tiktok_shop',
  'blibli',
] as const;
export type MarketplaceProvider = (typeof MARKETPLACE_PROVIDERS)[number];

/** Shopee and TikTok Shop use OAuth; Blibli binds seller API keys. */
export type MarketplaceConnectMode = 'oauth_redirect' | 'credential_binding';

export const MARKETPLACE_CONNECT_MODES: Readonly<
  Record<MarketplaceProvider, MarketplaceConnectMode>
> = {
  shopee: 'oauth_redirect',
  tiktok_shop: 'oauth_redirect',
  blibli: 'credential_binding',
};

/** No `pending` or `error`: in-flight auth lives only in OAuth states. */
export const MARKETPLACE_CONNECTION_STATUSES = [
  'connected',
  'needs_reauth',
  'disconnected',
] as const;
export type MarketplaceConnectionStatus =
  (typeof MARKETPLACE_CONNECTION_STATUSES)[number];

/** Admin (Putuskan) releases the store claim; seller/provider keep it. */
export type MarketplaceDisconnectSource = 'admin' | 'seller' | 'provider';

export const MARKETPLACE_CAPABILITY_KEYS = [
  'order_import',
  'inventory_sync',
  'labels',
  'webhooks',
  'pickup',
] as const;
export type MarketplaceCapabilityKey =
  (typeof MARKETPLACE_CAPABILITY_KEYS)[number];

export type MarketplaceCapabilityState =
  'supported' | 'manual' | 'unsupported' | 'unknown';

export type MarketplaceCapabilities = Record<
  MarketplaceCapabilityKey,
  MarketplaceCapabilityState
>;

export function isMarketplaceProvider(
  value: string
): value is MarketplaceProvider {
  return (MARKETPLACE_PROVIDERS as readonly string[]).includes(value);
}

function requireId(label: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${label} is required`);
  }
  return trimmed;
}

/**
 * Builders for the UTA-24 Store SKU `platform_sku_id`. Shopee uses
 * `item_id:model_id` with model 0 when the item has no variants.
 */
export const PlatformSkuId = {
  shopee(itemId: string | number, modelId?: string | number | null): string {
    const item = requireId('Shopee item_id', String(itemId));
    const model =
      modelId === undefined || modelId === null ? '0' : String(modelId);
    return `${item}:${requireId('Shopee model_id', model)}`;
  },
  tiktokShop(skuId: string): string {
    return requireId('TikTok Shop sku_id', skuId);
  },
  blibli(gdnSku: string): string {
    return requireId('Blibli gdnSku', gdnSku);
  },
} as const;
