import { DomainError } from '../errors/domain-error';
import type { MarketplaceProvider } from '../entities/marketplace-connection';

/**
 * Data shapes for the `MarketplaceConnector` port (UTA-39 / US20, RFC 04
 * task 13a). Adapters fill these from provider APIs; they never carry
 * buyer PII and secrets only travel inside `MarketplaceCredentials`.
 */

/** Secret material is sealed by the credential vault and never logged. */
export interface MarketplaceCredentials {
  readonly secrets: Readonly<Record<string, string>>;
  readonly grantedScopes: readonly string[];
  readonly accessTokenExpiresAt: Date | null;
  readonly authExpiresAt: Date | null;
}

export interface MarketplaceShop {
  readonly providerStoreId: string;
  readonly providerAccountId: string | null;
  readonly shopCipher: string | null;
  readonly storeName: string | null;
  readonly region: string | null;
}

/** Everything an adapter needs to call the provider for one store. */
export interface MarketplaceConnectorContext {
  readonly provider: MarketplaceProvider;
  readonly shop: MarketplaceShop;
  readonly credentials: MarketplaceCredentials;
}

export interface MarketplaceLocation {
  readonly externalLocationId: string;
  readonly name: string | null;
}

/** One Store SKU row; `platformSkuId` is already built by the adapter. */
export interface MarketplaceListingRow {
  readonly externalItemId: string;
  readonly platformSkuId: string;
  readonly storeSkuText: string | null;
  readonly barcodeHint: string | null;
  readonly title: string | null;
  readonly variantName: string | null;
  readonly listingStatus: string | null;
  readonly providerStock: number | null;
}

export interface MarketplaceListingPage {
  readonly rows: readonly MarketplaceListingRow[];
  readonly nextCursor: string | null;
}

/** PII-free order summary for the initial-import preview. */
export interface MarketplaceOrderPreviewRow {
  readonly externalOrderId: string;
  readonly providerStatus: string | null;
  readonly orderedAt: Date | null;
  readonly lineCount: number;
  readonly totalCents: number | null;
}

export interface MarketplaceWebhookEvent {
  readonly dedupeKey: string;
  readonly eventType: string;
  readonly providerStoreId: string | null;
  readonly payload: unknown;
}

export type MarketplaceConnectorErrorKind =
  | 'auth_invalid'
  | 'rate_limited'
  | 'unavailable'
  | 'bad_request'
  | 'unsupported_account';

/** Adapters normalize every provider failure to one of these kinds. */
export class MarketplaceConnectorError extends DomainError {
  readonly kind: MarketplaceConnectorErrorKind;
  readonly retryAfterMs: number | null;

  constructor(
    kind: MarketplaceConnectorErrorKind,
    message: string,
    retryAfterMs: number | null = null
  ) {
    super(message, `MARKETPLACE_${kind.toUpperCase()}`);
    this.kind = kind;
    this.retryAfterMs = retryAfterMs;
  }
}
