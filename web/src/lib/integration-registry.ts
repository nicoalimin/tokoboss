/**
 * Marketplace connector registry from env (US20 / RFC 04 task 82b): the
 * real Shopee, TikTok Shop and Blibli adapters with live `fetch` and the
 * system clock, gated by `MARKETPLACE_PROVIDERS_ENABLED`. A provider whose
 * app config is incomplete stays disabled (ship dark), so the connect,
 * callback and webhook routes 404 for it. Secrets are never logged.
 */
import type { MarketplaceProvider } from '@tokoboss/domain';
import {
  createMarketplaceConnectorRegistry,
  parseEnabledProviders,
  type BlibliConnectorConfig,
  type MarketplaceConnectorRegistry,
  type ShopeeConnectorConfig,
  type TikTokConnectorConfig,
} from '@tokoboss/integrations';

type Env = Readonly<Record<string, string | undefined>>;

/** Live I/O; global `fetch` is looked up per call so tests can stub it. */
const io = {
  fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
  now: () => new Date(),
};

/** Trimmed value, or undefined when unset or blank. */
function read(env: Env, name: string): string | undefined {
  return env[name]?.trim() || undefined;
}

/** Public app origin (NEXT_PUBLIC_APP_URL), no trailing slash. */
function appOrigin(env: Env): string {
  const url = read(env, 'NEXT_PUBLIC_APP_URL') ?? 'http://localhost:3000';
  return url.replace(/\/+$/, '');
}

/** OAuth redirect target: `GET /api/integrations/[provider]/callback`. */
export function redirectUri(
  provider: MarketplaceProvider,
  env: Env = process.env
): string {
  return `${appOrigin(env)}/api/integrations/${provider}/callback`;
}

function shopeeConfig(env: Env): ShopeeConnectorConfig | undefined {
  const partnerId = Number(read(env, 'SHOPEE_PARTNER_ID'));
  const partnerKey = read(env, 'SHOPEE_PARTNER_KEY');
  const host = read(env, 'SHOPEE_API_HOST');
  if (!Number.isSafeInteger(partnerId) || partnerId <= 0) return undefined;
  if (!partnerKey || !host) return undefined;
  return { partnerId, partnerKey, host, ...io };
}

function tiktokConfig(env: Env): TikTokConnectorConfig | undefined {
  const appKey = read(env, 'TIKTOK_SHOP_APP_KEY');
  const appSecret = read(env, 'TIKTOK_SHOP_APP_SECRET');
  const serviceId = read(env, 'TIKTOK_SHOP_SERVICE_ID');
  const host = read(env, 'TIKTOK_SHOP_API_HOST');
  const authHost = read(env, 'TIKTOK_SHOP_AUTH_HOST');
  const authorizeHost = read(env, 'TIKTOK_SHOP_AUTHORIZE_HOST');
  if (!appKey || !appSecret || !serviceId) return undefined;
  if (!host || !authHost || !authorizeHost) return undefined;
  const app = { appKey, appSecret, serviceId, host, authHost, authorizeHost };
  const hook = `${appOrigin(env)}/api/webhooks/tiktok_shop`; // task 94
  return { ...app, webhookAddress: hook, ...io };
}

function blibliConfig(env: Env): BlibliConnectorConfig | undefined {
  const blibliEnv = read(env, 'BLIBLI_ENV');
  const clientId = read(env, 'BLIBLI_CLIENT_ID');
  const clientKey = read(env, 'BLIBLI_CLIENT_KEY');
  const channelId = read(env, 'BLIBLI_CHANNEL_ID');
  if (blibliEnv !== 'uat' && blibliEnv !== 'production') return undefined;
  if (!clientId || !clientKey || !channelId) return undefined;
  return { env: blibliEnv, clientId, clientKey, channelId, ...io };
}

/** Enabled ∩ configured providers, built fresh from `env`. */
export function connectorRegistryFromEnv(
  env: Env = process.env
): MarketplaceConnectorRegistry {
  return createMarketplaceConnectorRegistry({
    enabled: parseEnabledProviders(env['MARKETPLACE_PROVIDERS_ENABLED']),
    shopee: shopeeConfig(env),
    tiktok_shop: tiktokConfig(env),
    blibli: blibliConfig(env),
  });
}

let registry: MarketplaceConnectorRegistry | null = null;

/** Process-wide registry from `process.env`, built once on first use. */
export function getConnectorRegistry(): MarketplaceConnectorRegistry {
  return (registry ??= connectorRegistryFromEnv());
}

/** Drop the cached registry (test seam for `web/src/__tests__`). */
export function __resetConnectorRegistryForTests(): void {
  registry = null;
}
