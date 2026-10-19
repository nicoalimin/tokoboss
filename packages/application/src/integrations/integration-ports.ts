import type {
  MarketplaceCredentials,
  MarketplaceLocation,
  MarketplaceOrderPreviewRow,
  MarketplaceProvider,
} from '@tokoboss/domain';
import type {
  ConnectionPatch,
  ConnectionRecord,
  CredentialKind,
  InboundEventRecord,
  InboundEventStatus,
  ListingUpsertInput,
  OAuthStateRecord,
  StoreClaimRecord,
  UpsertConnectionInput,
} from './integration-port-inputs';
import type { ListingRowView, OrderPreviewView } from './integration-types';

/** US20 integration store ports (RFC 04 task 16b). Misses return null. */
type StoreKey = { provider: MarketplaceProvider; providerStoreId: string };
type ConnectionRef = { workspaceId: string; connectionId: string };

export interface ConnectionStore {
  find(workspaceId: string, id: string): Promise<ConnectionRecord | null>;
  findByStore(
    input: StoreKey & { workspaceId: string }
  ): Promise<ConnectionRecord | null>;
  list(workspaceId: string): Promise<ConnectionRecord[]>;
  /** Connected rows whose auth expires before `before` (expiry sweep). */
  listExpiring(before: Date): Promise<ConnectionRecord[]>;
  upsert(input: UpsertConnectionInput): Promise<ConnectionRecord>;
  /** Throws on a stale `expectedVersion`. */
  update(
    input: ConnectionRef & { expectedVersion: number; patch: ConnectionPatch }
  ): Promise<ConnectionRecord>;
}

export interface CredentialVault {
  seal(
    connectionId: string,
    kind: CredentialKind,
    credentials: MarketplaceCredentials
  ): Promise<void>;
  open(connectionId: string): Promise<MarketplaceCredentials | null>;
  shred(connectionId: string): Promise<void>;
}

export interface OAuthStateStore {
  create(record: OAuthStateRecord, stateHash: string): Promise<void>;
  /** Atomically consumes; null when unknown, expired or already used. */
  consume(stateHash: string, now: Date): Promise<OAuthStateRecord | null>;
}

/** Global claims: ON CONFLICT DO NOTHING, then return the owner row. */
export interface StoreClaimStore {
  find(key: StoreKey): Promise<StoreClaimRecord | null>;
  acquire(claim: StoreClaimRecord): Promise<StoreClaimRecord>;
  /** Only the owning workspace may release; false when not the owner. */
  release(key: StoreKey & { workspaceId: string }): Promise<boolean>;
}

export interface InboundEventStore {
  /** Dedupe insert on (provider, dedupeKey); false when a duplicate. */
  insert(event: InboundEventRecord): Promise<boolean>;
  find(id: string): Promise<InboundEventRecord | null>;
  markStatus(
    id: string,
    status: InboundEventStatus,
    patch: Partial<InboundEventRecord>
  ): Promise<void>;
}

export interface ListingStore {
  upsertPage(ref: ConnectionRef, rows: ListingUpsertInput[]): Promise<number>;
  list(ref: ConnectionRef): Promise<ListingRowView[]>;
  countMapped(ref: ConnectionRef): Promise<number>;
  upsertLocations(
    ref: ConnectionRef,
    locations: readonly MarketplaceLocation[]
  ): Promise<number>;
  linkLocation(
    ref: ConnectionRef & { externalLocationId: string },
    warehouseId: string | null
  ): Promise<boolean>;
  /** Archive (Hapus koneksi) or unarchive (reconnect) channel mappings. */
  setMappingsArchived(
    key: StoreKey & { workspaceId: string },
    archivedAt: Date | null
  ): Promise<number>;
}

/** PII-free order preview; replace keeps at most 50 from 7 days. */
export interface OrderPreviewStore {
  replace(
    ref: ConnectionRef,
    rows: readonly MarketplaceOrderPreviewRow[]
  ): Promise<number>;
  list(ref: ConnectionRef): Promise<OrderPreviewView[]>;
}
