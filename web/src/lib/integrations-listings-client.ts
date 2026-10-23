/**
 * Browser client for the US20 import review reads (RFC 04 task 101b):
 * staged listings (paged, optional `mapping_state` filter) and recent
 * order previews for one connection. Admin or Manager only; Staff gets a
 * 403 ROLE_FORBIDDEN `IntegrationClientError`. Reuses the 101a request
 * helper, so errors, 401 `needsReauth` and the same-origin cookie behave
 * the same. Read-only and PII-free: no buyer data, nothing writes mappings.
 */
import type {
  IntegrationListingMappingState,
  IntegrationListingsPage,
  IntegrationOrderPreviewView,
} from '@tokoboss/contracts';
import {
  integrationsPath,
  integrationsRequest,
  type FetchFn,
} from './integrations-client';

export interface StagedListingsQuery {
  mappingState?: IntegrationListingMappingState;
  cursor?: string;
}

/** `.../:connectionId/listings[?mapping_state=&cursor=]`, encoded. */
export function stagedListingsPath(
  workspaceId: string,
  connectionId: string,
  query: StagedListingsQuery = {}
): string {
  const params = new URLSearchParams();
  if (query.mappingState) params.set('mapping_state', query.mappingState);
  if (query.cursor) params.set('cursor', query.cursor);
  const qs = params.toString();
  const path = integrationsPath(workspaceId, connectionId, 'listings');
  return qs ? `${path}?${qs}` : path;
}

/** GET one page of staged listings; pass `nextCursor` for the next page. */
export async function getStagedListings(
  workspaceId: string,
  connectionId: string,
  query: StagedListingsQuery = {},
  fetchFn: FetchFn = fetch
): Promise<IntegrationListingsPage> {
  const data = await integrationsRequest<Partial<IntegrationListingsPage>>(
    stagedListingsPath(workspaceId, connectionId, query),
    {},
    fetchFn
  );
  return {
    listings: Array.isArray(data.listings) ? data.listings : [],
    nextCursor: typeof data.nextCursor === 'string' ? data.nextCursor : null,
  };
}

/** GET recent order previews (newest first, max 50; no buyer data). */
export async function getOrderPreviews(
  workspaceId: string,
  connectionId: string,
  fetchFn: FetchFn = fetch
): Promise<IntegrationOrderPreviewView[]> {
  const data = await integrationsRequest<{
    orders?: IntegrationOrderPreviewView[];
  }>(integrationsPath(workspaceId, connectionId, 'orders'), {}, fetchFn);
  return Array.isArray(data.orders) ? data.orders : [];
}
