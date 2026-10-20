import type { ConnectionRecord } from './integration-port-inputs';
import type * as ports from './integration-ports';

export interface RemoveConnectionTx {
  connections: Pick<ports.ConnectionStore, 'update'>;
  claims: Pick<ports.StoreClaimStore, 'release'>;
  listings: Pick<ports.ListingStore, 'setMappingsArchived'>;
}

export interface ConnectionRemovalInput {
  workspaceId: string;
  connectionId: string;
  row: ConnectionRecord;
  now: Date;
}

export interface ConnectionRemovalResult {
  saved: ConnectionRecord;
  claimReleased: boolean;
  mappingsArchived: number;
}

/**
 * Transaction body for Hapus koneksi (US20 / RFC 04 task 27a). Releases the
 * claim if this workspace still holds it, archives this workspace's mappings
 * for the store and soft-removes the row (removed_at). A stale version
 * throws, so the caller's transaction rolls all three writes back.
 */
export async function applyConnectionRemoval(
  tx: RemoveConnectionTx,
  input: ConnectionRemovalInput
): Promise<ConnectionRemovalResult> {
  const { workspaceId, connectionId, row, now } = input;
  const key = {
    workspaceId,
    provider: row.provider,
    providerStoreId: row.providerStoreId,
  };
  // Seller/provider disconnects keep the claim; false when not held.
  const claimReleased = await tx.claims.release(key);
  const mappingsArchived = await tx.listings.setMappingsArchived(key, now);
  const saved = await tx.connections.update({
    workspaceId,
    connectionId,
    expectedVersion: row.version,
    patch: { removedAt: now },
  });
  return { saved, claimReleased, mappingsArchived };
}
