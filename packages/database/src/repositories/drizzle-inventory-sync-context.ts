import { and, eq } from 'drizzle-orm';
import type {
  MappingSyncContextSnapshot,
  MappingSyncState,
} from '@tokoboss/application';
import type {
  MarketplaceConnectionStatus,
  StoreLocationLinkSnapshot,
} from '@tokoboss/domain';
import {
  catalogInventoryLevels,
  catalogWarehouses,
  marketplaceLocationLinks,
} from '../schema/index';
import {
  type DbOrTx,
  selectScopedMappings,
  toInventorySyncMappingRef,
} from './drizzle-inventory-sync-scope';

/**
 * loadMappingContext for the Drizzle inventory sync read store (UTA-37 /
 * US04, RFC 06 task 29b). One fresh read per push: active mapping +
 * connection + state (29a) plus the variant's per-warehouse on-hand levels
 * (with warehouse status, so the domain drops deactivated ones) and the
 * store's location → warehouse links. Stock never comes from a job payload.
 */
export async function loadInventorySyncContext(
  db: DbOrTx,
  workspaceId: string,
  mappingId: string
): Promise<MappingSyncContextSnapshot | null> {
  const [row] = await selectScopedMappings(db, { workspaceId, mappingId });
  if (!row) return null;
  const { mapping, connection } = row;
  const lvl = catalogInventoryLevels;
  const wh = catalogWarehouses;
  const ll = marketplaceLocationLinks;
  type Level = { warehouseId: string; qty: number; status: string };
  const [levels, links]: [Level[], StoreLocationLinkSnapshot[]] =
    await Promise.all([
      db
        .select({
          warehouseId: lvl.warehouseId,
          qty: lvl.qty,
          status: wh.status,
        })
        .from(lvl)
        .innerJoin(
          wh,
          and(eq(wh.id, lvl.warehouseId), eq(wh.workspaceId, workspaceId))
        )
        .where(
          and(
            eq(lvl.workspaceId, workspaceId),
            eq(lvl.variantId, mapping.variantId)
          )
        ),
      connection
        ? db
            .select({
              externalLocationId: ll.externalLocationId,
              warehouseId: ll.warehouseId,
            })
            .from(ll)
            .where(
              and(
                eq(ll.workspaceId, workspaceId),
                eq(ll.connectionId, connection.id)
              )
            )
        : Promise.resolve([]),
    ]);
  return {
    ...toInventorySyncMappingRef(row),
    workspaceId,
    connectionId: connection?.id ?? null,
    connectionStatus:
      (connection?.status as MarketplaceConnectionStatus | undefined) ?? null,
    shopExtId: mapping.shopExtId,
    externalItemId: mapping.externalItemId,
    state: (row.state as MappingSyncState | null) ?? null,
    warehouses: levels.map((l) => ({
      warehouseId: l.warehouseId,
      warehouseStatus: l.status === 'active' ? 'active' : 'deactivated',
      onHandQty: l.qty,
    })),
    locationLinks: links,
  };
}
