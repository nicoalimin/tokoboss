import type {
  MarketplaceCapabilities,
  MarketplaceConnectMode,
  MarketplaceProvider,
} from '../entities/marketplace-connection';
import type {
  MarketplaceConnectorContext,
  MarketplaceCredentials,
  MarketplaceListingPage,
  MarketplaceLocation,
  MarketplaceOrderPreviewRow,
  MarketplaceShop,
  MarketplaceWebhookEvent,
} from './marketplace-connector-types';

/**
 * Provider-agnostic marketplace connector port (UTA-39 / US20, RFC 04
 * task 13b). Adapters in `@tokoboss/integrations` implement it per
 * provider; they take injected `fetch` and clock, have no DB access, and
 * throw only `MarketplaceConnectorError`.
 */
export interface MarketplaceAuthorizeInput {
  readonly state: string;
  readonly redirectUri: string;
}

export interface MarketplaceExchangeInput {
  readonly code: string;
  readonly redirectUri: string;
  readonly query: Readonly<Record<string, string>>;
}

export interface MarketplaceExchangeResult {
  readonly credentials: MarketplaceCredentials;
  readonly shops: readonly MarketplaceShop[];
}

export interface MarketplaceCapabilityResult {
  readonly capabilities: MarketplaceCapabilities;
  readonly missingPermissions: readonly string[];
}

export interface MarketplaceWebhookRequest {
  readonly rawBody: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly url: string;
}

export interface MarketplaceConnector {
  readonly provider: MarketplaceProvider;
  readonly connectMode: MarketplaceConnectMode;

  buildAuthorizeUrl(input: MarketplaceAuthorizeInput): string;
  exchangeAuthCode(
    input: MarketplaceExchangeInput
  ): Promise<MarketplaceExchangeResult>;
  refresh(ctx: MarketplaceConnectorContext): Promise<MarketplaceCredentials>;
  validateCredentials(ctx: MarketplaceConnectorContext): Promise<void>;

  describeCapabilities(
    shop: MarketplaceShop,
    grantedScopes: readonly string[]
  ): MarketplaceCapabilityResult;

  listLocations(
    ctx: MarketplaceConnectorContext
  ): Promise<readonly MarketplaceLocation[]>;
  listListingsPage(
    ctx: MarketplaceConnectorContext,
    cursor: string | null
  ): Promise<MarketplaceListingPage>;
  listRecentOrders(
    ctx: MarketplaceConnectorContext,
    window: { readonly days: number; readonly limit: number }
  ): Promise<readonly MarketplaceOrderPreviewRow[]>;

  verifyWebhook(request: MarketplaceWebhookRequest): boolean;
  parseWebhook(rawBody: string): readonly MarketplaceWebhookEvent[];
}
