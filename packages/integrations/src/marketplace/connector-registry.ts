import {
  isMarketplaceProvider,
  MARKETPLACE_PROVIDERS,
  type MarketplaceConnector,
  type MarketplaceProvider,
} from '@tokoboss/domain';
import {
  createBlibliConnector,
  type BlibliConnectorConfig,
} from './blibli/blibli-connector';
import {
  createShopeeConnector,
  type ShopeeConnectorConfig,
} from './shopee/shopee-connector';
import {
  createTikTokConnector,
  type TikTokConnectorConfig,
} from './tiktok-shop/tiktok-connector';

/**
 * Marketplace connector registry (UTA-39 / US20, RFC 04 task 64): maps a
 * provider id to its `MarketplaceConnector`, honouring the enabled list
 * from `MARKETPLACE_PROVIDERS_ENABLED`. Unknown, disabled or unconfigured
 * providers resolve to `null` so the connect, callback and webhook routes
 * 404 (ship dark: an empty list disables everything).
 */
export type MarketplaceConnectorFactories = {
  readonly [P in MarketplaceProvider]?: () => MarketplaceConnector;
};

export interface MarketplaceConnectorRegistry {
  readonly enabledProviders: readonly MarketplaceProvider[];
  isEnabled(provider: string): provider is MarketplaceProvider;
  get(provider: string): MarketplaceConnector | null;
}

/** Comma list, case/space tolerant; unknown ids dropped, order canonical. */
export function parseEnabledProviders(
  raw: string | undefined
): readonly MarketplaceProvider[] {
  const wanted = new Set(
    (raw ?? '')
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
  );
  return MARKETPLACE_PROVIDERS.filter((provider) => wanted.has(provider));
}

/** Enabled ∩ configured; each connector is built once, on first use. */
export function createConnectorRegistry(
  factories: MarketplaceConnectorFactories,
  enabled: readonly MarketplaceProvider[]
): MarketplaceConnectorRegistry {
  const enabledProviders = MARKETPLACE_PROVIDERS.filter(
    (provider) =>
      enabled.includes(provider) && factories[provider] !== undefined
  );
  const built = new Map<MarketplaceProvider, MarketplaceConnector>();
  const isEnabled = (provider: string): provider is MarketplaceProvider =>
    isMarketplaceProvider(provider) && enabledProviders.includes(provider);
  return {
    enabledProviders,
    isEnabled,
    get: (provider) => {
      if (!isEnabled(provider)) return null;
      const cached = built.get(provider);
      if (cached) return cached;
      const connector = factories[provider]!();
      built.set(provider, connector);
      return connector;
    },
  };
}

export interface MarketplaceRegistryConfig {
  /** Usually `parseEnabledProviders(env.MARKETPLACE_PROVIDERS_ENABLED)`. */
  readonly enabled: readonly MarketplaceProvider[];
  readonly shopee?: ShopeeConnectorConfig;
  readonly tiktok_shop?: TikTokConnectorConfig;
  readonly blibli?: BlibliConnectorConfig;
}

/** Real adapters; a provider without app config stays disabled. */
export function createMarketplaceConnectorRegistry(
  config: MarketplaceRegistryConfig
): MarketplaceConnectorRegistry {
  const { shopee, tiktok_shop: tiktok, blibli } = config;
  const factories: MarketplaceConnectorFactories = {
    ...(shopee && { shopee: () => createShopeeConnector(shopee) }),
    ...(tiktok && { tiktok_shop: () => createTikTokConnector(tiktok) }),
    ...(blibli && { blibli: () => createBlibliConnector(blibli) }),
  };
  return createConnectorRegistry(factories, config.enabled);
}
