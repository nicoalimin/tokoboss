import type {
  MarketplaceLocation,
  MarketplaceProvider,
} from '@tokoboss/domain';
import type { ListingUpsertInput } from './integration-port-inputs';
import type { ListingStore } from './integration-ports';
import type { ListingRowView } from './integration-types';

type ConnectionRef = { workspaceId: string; connectionId: string };
type StoreKey = { provider: MarketplaceProvider; providerStoreId: string };
type LocationRow = ConnectionRef &
  MarketplaceLocation & {
    warehouseId: string | null;
  };
type MappingRow = StoreKey & { workspaceId: string; archivedAt: Date | null };

const refKey = (ref: ConnectionRef, id: string) =>
  `${ref.workspaceId}:${ref.connectionId}:${id}`;

/**
 * In-memory ListingStore test fake (US20, RFC 04 task 34d). Listings and
 * locations upsert per connection; `mappings` stands in for channel
 * mappings so Hapus koneksi archive/unarchive can be asserted.
 */
export class InMemoryListingStore implements ListingStore {
  readonly listings = new Map<string, ListingRowView & ConnectionRef>();
  readonly locations = new Map<string, LocationRow>();
  readonly mappings: MappingRow[] = [];

  async upsertPage(ref: ConnectionRef, rows: ListingUpsertInput[]) {
    for (const row of rows) {
      const key = refKey(ref, row.platformSkuId);
      this.listings.set(key, { ...row, ...ref });
    }
    return rows.length;
  }

  async list(ref: ConnectionRef) {
    return [...this.listings.values()]
      .filter(
        (r) =>
          r.workspaceId === ref.workspaceId &&
          r.connectionId === ref.connectionId
      )
      .map(({ workspaceId: _ws, ...view }) => ({ ...view }));
  }

  async countMapped(ref: ConnectionRef) {
    const rows = await this.list(ref);
    return rows.filter((r) => r.mappingState === 'mapped').length;
  }

  async upsertLocations(
    ref: ConnectionRef,
    locations: readonly MarketplaceLocation[]
  ) {
    for (const loc of locations) {
      const key = refKey(ref, loc.externalLocationId);
      const warehouseId = this.locations.get(key)?.warehouseId ?? null;
      this.locations.set(key, { ...ref, ...loc, warehouseId });
    }
    return locations.length;
  }

  async linkLocation(
    ref: ConnectionRef & { externalLocationId: string },
    warehouseId: string | null
  ) {
    const row = this.locations.get(refKey(ref, ref.externalLocationId));
    if (!row) return false;
    row.warehouseId = warehouseId;
    return true;
  }

  async setMappingsArchived(
    key: StoreKey & { workspaceId: string },
    archivedAt: Date | null
  ) {
    let changed = 0;
    for (const m of this.mappings) {
      if (m.workspaceId !== key.workspaceId) continue;
      if (m.provider !== key.provider) continue;
      if (m.providerStoreId !== key.providerStoreId) continue;
      if ((m.archivedAt === null) === (archivedAt === null)) continue;
      m.archivedAt = archivedAt;
      changed += 1;
    }
    return changed;
  }
}
