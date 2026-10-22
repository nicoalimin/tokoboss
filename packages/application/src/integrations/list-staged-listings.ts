import type { WorkspaceContext } from '../tenancy/tenancy-types';
import {
  connectionNotFound,
  integrationValidation,
} from './integration-errors';
import { assertIntegrationListingRead } from './integration-guards';
import type * as ports from './integration-ports';
import {
  LISTING_MAPPING_STATES,
  type ListingMappingState,
  type ListingRowView,
} from './integration-types';

/**
 * Staged listing review query (US20 / RFC 04 task 89a).
 *
 * Admin or Manager only (Staff 403 ROLE_FORBIDDEN). Unknown, removed or
 * other-workspace connection → 404 CONNECTION_NOT_FOUND. Optional
 * `mappingState` filter (unknown value → 400 INTEGRATION_VALIDATION).
 * Keyset cursor = the last `platformSkuId` of the previous page; rows are
 * sorted by `platformSkuId` ascending, STAGED_LISTINGS_PAGE_SIZE per page.
 * Shape matches the `IntegrationListingsPage` contract. Read-only: rows
 * carry hints only and nothing here writes mappings (Story 03).
 */

export const STAGED_LISTINGS_PAGE_SIZE = 50;

export interface ListStagedListingsDeps {
  connections: Pick<ports.ConnectionStore, 'find'>;
  listings: Pick<ports.ListingStore, 'list'>;
}

export interface ListStagedListingsInput {
  workspaceId: string;
  connectionId: string;
  mappingState?: string | null;
  cursor?: string | null;
}

export interface StagedListingsPage {
  listings: ListingRowView[];
  nextCursor: string | null;
}

function parseMappingState(
  raw: string | null | undefined
): ListingMappingState | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  if (!(LISTING_MAPPING_STATES as readonly string[]).includes(value)) {
    throw integrationValidation('Status pemetaan tidak dikenal.');
  }
  return value as ListingMappingState;
}

function byPlatformSkuId(a: ListingRowView, b: ListingRowView): number {
  if (a.platformSkuId === b.platformSkuId) return 0;
  return a.platformSkuId < b.platformSkuId ? -1 : 1;
}

export async function listStagedListings(
  deps: ListStagedListingsDeps,
  ctx: WorkspaceContext | null,
  input: ListStagedListingsInput
): Promise<StagedListingsPage> {
  assertIntegrationListingRead(ctx, input.workspaceId);
  const mappingState = parseMappingState(input.mappingState);
  const cursor = (input.cursor ?? '').trim();
  const { workspaceId, connectionId } = input;

  const row = await deps.connections.find(workspaceId, connectionId);
  if (!row || row.removedAt) throw connectionNotFound();

  const rows = (await deps.listings.list({ workspaceId, connectionId }))
    .filter((r) => !mappingState || r.mappingState === mappingState)
    .filter((r) => !cursor || r.platformSkuId > cursor)
    .sort(byPlatformSkuId);
  const listings = rows.slice(0, STAGED_LISTINGS_PAGE_SIZE);
  const last = listings[listings.length - 1];
  const hasMore = rows.length > STAGED_LISTINGS_PAGE_SIZE;
  return { listings, nextCursor: hasMore && last ? last.platformSkuId : null };
}
