import type { WorkspaceContext } from '../tenancy/tenancy-types';
import { connectionNotFound } from './integration-errors';
import { assertIntegrationStatusRead } from './integration-guards';
import type { ConnectionRecord } from './integration-port-inputs';
import type * as ports from './integration-ports';
import type { ConnectionView } from './integration-types';

/**
 * Connection list + detail queries (US20 / RFC 04 task 28).
 *
 * Every active member may read (Staff included). Removed rows (Hapus
 * koneksi) are hidden, so the store shows as Belum terhubung. Views never
 * carry secrets: ciphers, scopes, token expiry and version are dropped.
 */

export interface ListConnectionsDeps {
  connections: Pick<ports.ConnectionStore, 'find' | 'list'>;
}

export interface ListConnectionsInput {
  workspaceId: string;
}

export interface GetConnectionInput {
  workspaceId: string;
  connectionId: string;
}

/** Copies only the ConnectionView fields from a stored record. */
export function toConnectionView(row: ConnectionRecord): ConnectionView {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    provider: row.provider,
    connectMode: row.connectMode,
    providerStoreId: row.providerStoreId,
    storeName: row.storeName,
    region: row.region,
    status: row.status,
    disconnectSource: row.disconnectSource,
    disconnectedAt: row.disconnectedAt,
    capabilities: row.capabilities,
    missingPermissions: [...row.missingPermissions],
    authExpiresAt: row.authExpiresAt,
    lastCheckedAt: row.lastCheckedAt,
    lastErrorCode: row.lastErrorCode,
    orderImportEnabled: row.orderImportEnabled,
    inventorySyncEnabled: row.inventorySyncEnabled,
    initialImportStatus: row.initialImportStatus,
    connectedBy: row.connectedBy,
    connectedAt: row.connectedAt,
  };
}

export async function listConnections(
  deps: ListConnectionsDeps,
  ctx: WorkspaceContext | null,
  input: ListConnectionsInput
): Promise<ConnectionView[]> {
  assertIntegrationStatusRead(ctx, input.workspaceId);
  const rows = await deps.connections.list(input.workspaceId);
  return rows.filter((row) => !row.removedAt).map(toConnectionView);
}

export async function getConnection(
  deps: ListConnectionsDeps,
  ctx: WorkspaceContext | null,
  input: GetConnectionInput
): Promise<ConnectionView> {
  assertIntegrationStatusRead(ctx, input.workspaceId);
  const row = await deps.connections.find(
    input.workspaceId,
    input.connectionId
  );
  if (!row || row.removedAt) throw connectionNotFound();
  return toConnectionView(row);
}
