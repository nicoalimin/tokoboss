import type {
  MarketplaceCapabilities,
  MarketplaceConnectMode,
  MarketplaceConnectionStatus,
  MarketplaceDisconnectSource,
  MarketplaceProvider,
} from '@tokoboss/domain';

/**
 * Integrations application DTOs (UTA-39 / US20, RFC 04 task 15).
 *
 * Read models returned by the integration use cases and queries. They
 * never carry secrets (tokens, keys, ciphers) or buyer PII. Store ports:
 * integration-ports.ts (task 16). Wire schemas: contracts.
 */

export const INITIAL_IMPORT_STATUSES = [
  'queued',
  'running',
  'complete',
  'incomplete',
  'failed',
] as const;
export type InitialImportStatus = (typeof INITIAL_IMPORT_STATUSES)[number];

export const LISTING_MAPPING_STATES = [
  'unmapped',
  'suggested',
  'ambiguous',
  'mapped',
  'ignored',
] as const;
export type ListingMappingState = (typeof LISTING_MAPPING_STATES)[number];

/** One connection as shown on the list and detail screens (no secrets). */
export interface ConnectionView {
  id: string;
  workspaceId: string;
  provider: MarketplaceProvider;
  connectMode: MarketplaceConnectMode;
  providerStoreId: string;
  storeName: string | null;
  region: string | null;
  status: MarketplaceConnectionStatus;
  disconnectSource: MarketplaceDisconnectSource | null;
  disconnectedAt: Date | null;
  capabilities: MarketplaceCapabilities;
  missingPermissions: string[];
  authExpiresAt: Date | null;
  lastCheckedAt: Date | null;
  lastErrorCode: string | null;
  orderImportEnabled: boolean;
  inventorySyncEnabled: boolean;
  initialImportStatus: InitialImportStatus | null;
  connectedBy: string | null;
  connectedAt: Date | null;
}

/** One staged Store SKU row in the import review list. */
export interface ListingRowView {
  connectionId: string;
  externalItemId: string;
  platformSkuId: string;
  storeSkuText: string | null;
  barcodeHint: string | null;
  title: string | null;
  variantName: string | null;
  listingStatus: string | null;
  providerStock: number | null;
  mappingState: ListingMappingState;
  suggestedVariantIds: string[];
  lastSeenAt: Date;
}

/** PII-free recent order (max 50 from the last 7 days per connection). */
export interface OrderPreviewView {
  connectionId: string;
  externalOrderId: string;
  providerStatus: string | null;
  orderedAt: Date | null;
  lineCount: number;
  totalCents: number | null;
}

/** Counts for the initial-import success screen. */
export interface ImportSummary {
  connectionId: string;
  status: InitialImportStatus;
  listingsImported: number;
  storeSkusMapped: number;
  ordersImported: number;
  locationsFound: number;
  inventorySyncEnabled: boolean;
  completedAt: Date | null;
}
