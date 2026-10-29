/**
 * Browser client for the US20 connection lifecycle writes (RFC 04 task
 * 101c): start connection, reauthorize (incl. the Blibli key form),
 * Putuskan and Hapus koneksi. Admin only; Manager / Staff get a 403
 * ROLE_FORBIDDEN `IntegrationClientError`. Reuses the 101a request helper
 * (same-origin cookie, 401 `needsReauth`). Blibli keys go out once in the
 * body and are never kept or echoed. Location link + import retry: 101d.
 * First Blibli connect (task 113b) posts the keys to the list route.
 * Story 18 (RFC 07 row 29): store controls PATCH, activity feed GET (all
 * members) and the typed PUTUSKAN confirmation on disconnect.
 */
import type {
  IntegrationActivityItemDto,
  IntegrationBlibliKeyFormBody,
  IntegrationConnectionView,
  IntegrationStartConnectionResponse,
  MarketplaceProviderWire,
  UpdateConnectionControlsBody,
} from '@tokoboss/contracts';
import {
  integrationsPath,
  integrationsRequest,
  type FetchFn,
} from './integrations-client';

type ConnectionBody = { connection: IntegrationConnectionView };

/** POST {provider}: OAuth authorize URL or the Blibli key form mode. */
export function startIntegrationConnection(
  workspaceId: string,
  provider: MarketplaceProviderWire,
  fetchFn: FetchFn = fetch
): Promise<IntegrationStartConnectionResponse> {
  const path = integrationsPath(workspaceId);
  const init = { method: 'POST', body: { provider } };
  return integrationsRequest(path, init, fetchFn);
}

/** POST {provider:'blibli', ...keys}: first Blibli connect (task 113b). */
export async function connectBlibliStore(
  workspaceId: string,
  keys: IntegrationBlibliKeyFormBody,
  fetchFn: FetchFn = fetch
): Promise<IntegrationConnectionView> {
  const path = integrationsPath(workspaceId);
  const init = { method: 'POST', body: { provider: 'blibli', ...keys } };
  const data = await integrationsRequest<ConnectionBody>(path, init, fetchFn);
  return data.connection;
}

/** POST .../reauthorize with no body: restart the connect flow. */
export function reauthorizeIntegrationConnection(
  workspaceId: string,
  connectionId: string,
  fetchFn: FetchFn = fetch
): Promise<IntegrationStartConnectionResponse> {
  const path = integrationsPath(workspaceId, connectionId, 'reauthorize');
  return integrationsRequest(path, { method: 'POST' }, fetchFn);
}

/** POST .../reauthorize with the Blibli keys (same merchant code or 409). */
export async function submitBlibliKeys(
  workspaceId: string,
  connectionId: string,
  keys: IntegrationBlibliKeyFormBody,
  fetchFn: FetchFn = fetch
): Promise<IntegrationConnectionView> {
  const path = integrationsPath(workspaceId, connectionId, 'reauthorize');
  const init = { method: 'POST', body: keys };
  const data = await integrationsRequest<ConnectionBody>(path, init, fetchFn);
  return data.connection;
}

/** DELETE the connection = Putuskan (shreds tokens, keeps mappings). */
export async function disconnectIntegrationConnection(
  workspaceId: string,
  connectionId: string,
  fetchFn: FetchFn = fetch
): Promise<IntegrationConnectionView> {
  const path = integrationsPath(workspaceId, connectionId);
  const init = { method: 'DELETE', body: { confirmationText: 'PUTUSKAN' } };
  const data = await integrationsRequest<ConnectionBody>(path, init, fetchFn);
  return data.connection;
}

/** PATCH .../controls (Admin): pause / resume import & sync, reconcile. */
export function updateConnectionControlsRequest(
  workspaceId: string,
  connectionId: string,
  body: UpdateConnectionControlsBody,
  fetchFn: FetchFn = fetch
): Promise<ConnectionBody & { reconciliationQueued: boolean }> {
  const path = integrationsPath(workspaceId, connectionId, 'controls');
  return integrationsRequest(path, { method: 'PATCH', body }, fetchFn);
}

/** GET .../activity (every member): the store's audit feed, newest first. */
export async function fetchConnectionActivity(
  workspaceId: string,
  connectionId: string,
  fetchFn: FetchFn = fetch
): Promise<IntegrationActivityItemDto[]> {
  const path = integrationsPath(workspaceId, connectionId, 'activity');
  const data = await integrationsRequest<{
    items?: IntegrationActivityItemDto[];
  }>(path, {}, fetchFn);
  return Array.isArray(data.items) ? data.items : [];
}

/** POST .../remove = Hapus koneksi (only from Terputus; else 400). */
export async function removeIntegrationConnection(
  workspaceId: string,
  connectionId: string,
  fetchFn: FetchFn = fetch
): Promise<IntegrationConnectionView> {
  const path = integrationsPath(workspaceId, connectionId, 'remove');
  const init = { method: 'POST' };
  const data = await integrationsRequest<ConnectionBody>(path, init, fetchFn);
  return data.connection;
}
