/**
 * Browser client for the US20 connection setup writes (RFC 04 task 101d):
 * gudang sumber location link and Lanjutkan impor. Admin only; Manager /
 * Staff get a 403 ROLE_FORBIDDEN `IntegrationClientError`. Reuses the 101a
 * request helper (same-origin cookie, 401 `needsReauth`). Connection
 * lifecycle writes (start, reauthorize, Putuskan, Hapus) live in 101c.
 */
import type {
  IntegrationConnectionView,
  IntegrationLocationLinkResponse,
} from '@tokoboss/contracts';
import {
  integrationsPath,
  integrationsRequest,
  type FetchFn,
} from './integrations-client';

/** POST .../:connectionId/import result (Lanjutkan impor). */
export interface IntegrationImportRetryResult {
  connectionId: string;
  jobId: string | null;
  status: NonNullable<IntegrationConnectionView['initialImportStatus']>;
  /** True when an import was already queued or running (no new job). */
  alreadyQueued: boolean;
}

/** PUT .../locations/:externalLocationId {warehouseId}; null clears it. */
export function setIntegrationLocationLink(
  workspaceId: string,
  connectionId: string,
  externalLocationId: string,
  warehouseId: string | null,
  fetchFn: FetchFn = fetch
): Promise<IntegrationLocationLinkResponse> {
  const path = integrationsPath(
    workspaceId,
    connectionId,
    'locations',
    externalLocationId
  );
  const init = { method: 'PUT', body: { warehouseId } };
  return integrationsRequest(path, init, fetchFn);
}

/** POST .../import = Lanjutkan impor (queued / running → alreadyQueued). */
export function retryIntegrationImport(
  workspaceId: string,
  connectionId: string,
  fetchFn: FetchFn = fetch
): Promise<IntegrationImportRetryResult> {
  const path = integrationsPath(workspaceId, connectionId, 'import');
  return integrationsRequest(path, { method: 'POST' }, fetchFn);
}
