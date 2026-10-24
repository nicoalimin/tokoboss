import type { WorkspaceContext } from '../tenancy/tenancy-types';
import { connectionNotFound } from './integration-errors';
import { assertIntegrationListingRead } from './integration-guards';
import type * as ports from './integration-ports';

/**
 * Pilih gudang sumber read (US20 / RFC 04 task 121a, CoS split of row
 * 121): the provider locations staged by the initial import (Shopee
 * location, TikTok warehouse, Blibli pickup point) with their linked
 * TokoBoss warehouse, or null when not linked yet. Admin or Manager only
 * (Staff 403 ROLE_FORBIDDEN), same guard as the staged listings. Unknown,
 * removed or other-workspace connection -> 404 CONNECTION_NOT_FOUND.
 * Sorted by name (unnamed last), then provider location id. Read-only;
 * linking stays in `assignLocationLink` (task 33, Admin only).
 */

type ConnectionRef = { workspaceId: string; connectionId: string };

/** One provider location and its source warehouse link. */
export interface LocationLinkView {
  connectionId: string;
  externalLocationId: string;
  name: string | null;
  warehouseId: string | null;
}

/** Read port; `ListingStore` gains this method in a later slice. */
export interface LocationLinkReader {
  listLocations(ref: ConnectionRef): Promise<LocationLinkView[]>;
}

export interface ListLocationLinksDeps {
  connections: Pick<ports.ConnectionStore, 'find'>;
  listings: LocationLinkReader;
}

export interface ListLocationLinksInput {
  workspaceId: string;
  connectionId: string;
}

export interface LocationLinkList {
  locations: LocationLinkView[];
}

function byNameThenId(a: LocationLinkView, b: LocationLinkView): number {
  if (a.name !== b.name) {
    if (a.name === null) return 1;
    if (b.name === null) return -1;
    return a.name < b.name ? -1 : 1;
  }
  if (a.externalLocationId === b.externalLocationId) return 0;
  return a.externalLocationId < b.externalLocationId ? -1 : 1;
}

export async function listLocationLinks(
  deps: ListLocationLinksDeps,
  ctx: WorkspaceContext | null,
  input: ListLocationLinksInput
): Promise<LocationLinkList> {
  assertIntegrationListingRead(ctx, input.workspaceId);
  const { workspaceId, connectionId } = input;

  const row = await deps.connections.find(workspaceId, connectionId);
  if (!row || row.removedAt) throw connectionNotFound();

  const rows = await deps.listings.listLocations({ workspaceId, connectionId });
  const locations = [...rows].sort(byNameThenId);
  return { locations };
}
