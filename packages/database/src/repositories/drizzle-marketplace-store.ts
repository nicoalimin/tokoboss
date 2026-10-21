import type {
  ListingRowView,
  ListingStore,
  ListingUpsertInput,
} from '@tokoboss/application';
import type {
  MarketplaceLocation,
  MarketplaceProvider,
} from '@tokoboss/domain';
import type { DatabaseHandle, Transaction } from '../db';
import { DrizzleConnectionStore } from './drizzle-marketplace-connections';
import { DrizzleCredentialRepository } from './drizzle-marketplace-credentials';
import { DrizzleInboundEventStore } from './drizzle-marketplace-inbound-events';
import { DrizzleListingRowStore } from './drizzle-marketplace-listings';
import { DrizzleLocationLinkStore } from './drizzle-marketplace-location-links';
import { DrizzleMappingArchiveStore } from './drizzle-marketplace-mapping-archive';
import { DrizzleOAuthStateStore } from './drizzle-marketplace-oauth-states';
import { DrizzleOrderPreviewStore } from './drizzle-marketplace-order-previews';
import { DrizzleStoreClaimStore } from './drizzle-marketplace-store-claims';

type DbOrTx = Transaction | DatabaseHandle;
type ConnectionRef = { workspaceId: string; connectionId: string };
type StoreRef = {
  workspaceId: string;
  provider: MarketplaceProvider;
  providerStoreId: string;
};

/** `ListingStore` over the listings (72a), location (72b), archive (74) files. */
export class DrizzleMarketplaceListingStore implements ListingStore {
  private readonly rows: DrizzleListingRowStore;
  private readonly locations: DrizzleLocationLinkStore;
  private readonly archive: DrizzleMappingArchiveStore;

  constructor(db: DbOrTx) {
    this.rows = new DrizzleListingRowStore(db);
    this.locations = new DrizzleLocationLinkStore(db);
    this.archive = new DrizzleMappingArchiveStore(db);
  }

  upsertPage(ref: ConnectionRef, rows: ListingUpsertInput[]) {
    return this.rows.upsertPage(ref, rows);
  }
  list(ref: ConnectionRef): Promise<ListingRowView[]> {
    return this.rows.list(ref);
  }
  countMapped(ref: ConnectionRef) {
    return this.rows.countMapped(ref);
  }
  upsertLocations(ref: ConnectionRef, locs: readonly MarketplaceLocation[]) {
    return this.locations.upsertLocations(ref, locs);
  }
  linkLocation(
    ref: ConnectionRef & { externalLocationId: string },
    warehouseId: string | null
  ) {
    return this.locations.linkLocation(ref, warehouseId);
  }
  setMappingsArchived(key: StoreRef, archivedAt: Date | null) {
    return this.archive.setMappingsArchived(key, archivedAt);
  }
}

/**
 * Postgres aggregate of the US20 integration ports (UTA-39 / RFC 04 task
 * 75), mirroring `InMemoryIntegrationStore`. `transaction` opens one SQL
 * transaction on the root handle (or reuses a bound one) and hands the body
 * a store whose ports all share it. The credential vault is web wiring
 * (task 82) over `credentials` plus the secret box.
 */
export class DrizzleMarketplaceStore {
  readonly connections: DrizzleConnectionStore;
  readonly credentials: DrizzleCredentialRepository;
  readonly oauthStates: DrizzleOAuthStateStore;
  readonly claims: DrizzleStoreClaimStore;
  readonly events: DrizzleInboundEventStore;
  readonly listings: DrizzleMarketplaceListingStore;
  readonly orderPreviews: DrizzleOrderPreviewStore;

  constructor(private readonly db: DbOrTx) {
    this.connections = new DrizzleConnectionStore(db);
    this.credentials = new DrizzleCredentialRepository(db);
    this.oauthStates = new DrizzleOAuthStateStore(db);
    this.claims = new DrizzleStoreClaimStore(db);
    this.events = new DrizzleInboundEventStore(db);
    this.listings = new DrizzleMarketplaceListingStore(db);
    this.orderPreviews = new DrizzleOrderPreviewStore(db);
  }

  withTransaction(tx: DbOrTx): DrizzleMarketplaceStore {
    return new DrizzleMarketplaceStore(tx);
  }

  readonly transaction = <T>(
    fn: (tx: DrizzleMarketplaceStore) => Promise<T>
  ): Promise<T> => {
    const handle = this.db as {
      transaction?: (fn: (tx: Transaction) => Promise<T>) => Promise<T>;
    };
    if (typeof handle.transaction !== 'function') return fn(this);
    return handle.transaction((tx) => fn(new DrizzleMarketplaceStore(tx)));
  };
}
