import type { TenancyAuditSink } from '../tenancy/tenancy-ports';
import { reauthStoreMismatch } from './integration-errors';
import type {
  ConnectionRecord,
  StoreClaimRecord,
} from './integration-port-inputs';
import type * as ports from './integration-ports';
import { acquireStoreClaim } from './store-ownership';

/**
 * Reauthorize / reconnect (US20 / RFC 04 task 25), used by complete OAuth
 * (21b) for `state.connectionId` and re-adding a store after Hapus koneksi.
 * 1. `assertReauthorizeSameStore`, before any write: another store → audit
 *    + 409 REAUTH_STORE_MISMATCH, nothing changes.
 * 2. `applyReauthorization`, inside the connect tx: re-acquire the claim
 *    (kept after seller/provider disconnect, re-taken after Putuskan, owned
 *    elsewhere → neutral 409) and unarchive this workspace's mappings.
 * 3. `auditReauthorization`, after the tokens are sealed.
 * Never seals, stores or revokes tokens: blocked attempts throw before the
 * caller seals, and the owning workspace's tokens are never touched.
 */

export interface ReauthorizeConnectionDeps {
  audit: Pick<TenancyAuditSink, 'append'>;
}

export interface ReauthorizeConnectionTx {
  claims: ports.StoreClaimStore;
  listings: Pick<ports.ListingStore, 'setMappingsArchived'>;
}

export interface ReauthorizeInput {
  /** This workspace's existing row (from the pre-check / state). */
  row: ConnectionRecord;
  actorId: string;
}

export async function assertReauthorizeSameStore(
  deps: ReauthorizeConnectionDeps,
  input: ReauthorizeInput & { providerStoreId: string }
): Promise<void> {
  const { row } = input;
  if ((input.providerStoreId ?? '').trim() === row.providerStoreId) return;
  await deps.audit.append({
    workspaceId: row.workspaceId,
    action: 'integration.reauth_store_mismatch',
    category: 'workspace',
    actorId: input.actorId,
    payload: {
      connectionId: row.id,
      provider: row.provider,
      providerStoreId: row.providerStoreId,
    },
  });
  throw reauthStoreMismatch();
}

export async function applyReauthorization(
  tx: ReauthorizeConnectionTx,
  deps: ReauthorizeConnectionDeps,
  input: ReauthorizeInput & { now: Date }
): Promise<{ claim: StoreClaimRecord; mappingsUnarchived: number }> {
  const { row, actorId, now } = input;
  const { workspaceId, provider, providerStoreId } = row;
  const key = { workspaceId, provider, providerStoreId };
  const claim = await acquireStoreClaim(
    { claims: tx.claims, audit: deps.audit },
    { ...key, connectionId: row.id, actorId, now, rowConnected: false }
  );
  const mappingsUnarchived = await tx.listings.setMappingsArchived(key, null);
  return { claim, mappingsUnarchived };
}

/** Disconnected or removed before → reconnected; else reauthorized. */
export async function auditReauthorization(
  deps: ReauthorizeConnectionDeps,
  input: ReauthorizeInput & {
    saved: ConnectionRecord;
    mappingsUnarchived: number;
  }
): Promise<void> {
  const { row, saved } = input;
  const reconnect = row.status === 'disconnected' || row.removedAt !== null;
  await deps.audit.append({
    workspaceId: row.workspaceId,
    action: reconnect ? 'integration.reconnected' : 'integration.reauthorized',
    category: 'workspace',
    actorId: input.actorId,
    payload: {
      connectionId: row.id,
      provider: row.provider,
      providerStoreId: row.providerStoreId,
      status: saved.status,
      mappingsUnarchived: input.mappingsUnarchived,
    },
  });
}
