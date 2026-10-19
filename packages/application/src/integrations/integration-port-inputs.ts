import type {
  MarketplaceConnectMode,
  MarketplaceListingRow,
  MarketplaceProvider,
  MarketplaceShop,
} from '@tokoboss/domain';
import type { ConnectionView, ListingMappingState } from './integration-types';

/**
 * Records and inputs for the integration store ports (UTA-39 / US20,
 * RFC 04 task 16a). Ports: integration-ports.ts (task 16b). Sealed
 * credential blobs never leave the vault; nothing here carries buyer PII.
 */

/** Full connection row: the view plus internal columns. */
export interface ConnectionRecord extends ConnectionView {
  providerAccountId: string | null;
  shopCipher: string | null;
  grantedScopes: string[];
  accessTokenExpiresAt: Date | null;
  lastRefreshedAt: Date | null;
  disconnectedBy: string | null;
  removedAt: Date | null;
  importJobId: string | null;
  version: number;
}

/** Insert or refresh the row keyed by (workspace, provider, store id). */
export interface UpsertConnectionInput {
  workspaceId: string;
  provider: MarketplaceProvider;
  connectMode: MarketplaceConnectMode;
  shop: MarketplaceShop;
  grantedScopes: string[];
  accessTokenExpiresAt: Date | null;
  authExpiresAt: Date | null;
  connectedBy: string;
  connectedAt: Date;
}

export type ConnectionPatch = Partial<
  Omit<ConnectionRecord, 'id' | 'workspaceId' | 'provider' | 'version'>
>;

export type CredentialKind = 'oauth_tokens' | 'blibli_keys';

export interface OAuthStateRecord {
  id: string;
  workspaceId: string;
  provider: MarketplaceProvider;
  userId: string;
  connectionId: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
}

/** Global owner of one provider store (one row per store). */
export interface StoreClaimRecord {
  provider: MarketplaceProvider;
  providerStoreId: string;
  workspaceId: string;
  connectionId: string;
  claimedBy: string;
  claimedAt: Date;
}

export type InboundEventStatus =
  'received' | 'processed' | 'ignored' | 'not_in_scope' | 'failed';

export interface InboundEventRecord {
  id: string;
  provider: MarketplaceProvider;
  dedupeKey: string;
  eventType: string;
  providerStoreId: string | null;
  connectionId: string | null;
  workspaceId: string | null;
  payload: unknown;
  status: InboundEventStatus;
  attempts: number;
  processedAt: Date | null;
  errorCode: string | null;
}

/** One staged listing write; unique on (connectionId, platformSkuId). */
export interface ListingUpsertInput extends MarketplaceListingRow {
  mappingState: ListingMappingState;
  suggestedVariantIds: string[];
  lastSeenAt: Date;
}
