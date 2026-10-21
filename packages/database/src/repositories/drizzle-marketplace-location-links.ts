import { and, eq, sql } from 'drizzle-orm';
import type { MarketplaceLocation } from '@tokoboss/domain';
import type { DatabaseHandle, Transaction } from '../db';
import { marketplaceLocationLinks } from '../schema/index';

type DbOrTx = Transaction | DatabaseHandle;
type ConnectionRef = { workspaceId: string; connectionId: string };
type LocationRef = ConnectionRef & { externalLocationId: string };

/**
 * Postgres-backed location-link half of `ListingStore` (UTA-39 / US20,
 * RFC 04 task 72b). Locations upsert on (connection_id,
 * external_location_id) and keep any existing warehouse link; listings
 * (72a) and mapping archive (74) live in sibling files.
 */
export class DrizzleLocationLinkStore {
  constructor(private readonly db: DbOrTx) {}

  withTransaction(tx: DbOrTx): DrizzleLocationLinkStore {
    return new DrizzleLocationLinkStore(tx);
  }

  async upsertLocations(
    ref: ConnectionRef,
    locations: readonly MarketplaceLocation[]
  ): Promise<number> {
    if (locations.length === 0) return 0;
    await this.db
      .insert(marketplaceLocationLinks)
      .values(
        locations.map((loc) => ({
          ...ref,
          externalLocationId: loc.externalLocationId,
          name: loc.name,
        }))
      )
      .onConflictDoUpdate({
        target: [
          marketplaceLocationLinks.connectionId,
          marketplaceLocationLinks.externalLocationId,
        ],
        set: { name: sql.raw('excluded.name'), updatedAt: new Date() },
      });
    return locations.length;
  }

  async linkLocation(
    ref: LocationRef,
    warehouseId: string | null
  ): Promise<boolean> {
    const rows = await this.db
      .update(marketplaceLocationLinks)
      .set({ warehouseId, updatedAt: new Date() })
      .where(
        and(
          eq(marketplaceLocationLinks.workspaceId, ref.workspaceId),
          eq(marketplaceLocationLinks.connectionId, ref.connectionId),
          eq(
            marketplaceLocationLinks.externalLocationId,
            ref.externalLocationId
          )
        )
      )
      .returning({ id: marketplaceLocationLinks.id });
    return rows.length > 0;
  }
}
