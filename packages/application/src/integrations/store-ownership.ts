import type { MarketplaceProvider } from '@tokoboss/domain';
import type { TenancyAuditSink } from '../tenancy/tenancy-ports';
import {
  alreadyConnected,
  storeConnectedElsewhere,
} from './integration-errors';
import type { StoreClaimRecord } from './integration-port-inputs';
import type { StoreClaimStore } from './integration-ports';

/**
 * Store ownership (US20 / RFC 04 task 19): first workspace to connect a
 * store owns it, no takeover in v1. Blocked attempts are audited only in
 * the attempting workspace; the error never names the owner.
 */

export const STORE_CLAIM_UNIQUE_CONSTRAINT =
  'marketplace_store_claims_provider_store_unique';

export interface StoreOwnershipDeps {
  claims: StoreClaimStore;
  audit: Pick<TenancyAuditSink, 'append'>;
}

export interface AcquireStoreClaimInput {
  workspaceId: string;
  connectionId: string;
  provider: MarketplaceProvider;
  providerStoreId: string;
  actorId: string;
  now: Date;
  /** This workspace's row for the store is already `connected`. */
  rowConnected: boolean;
}

/** A lost race: 23505 on the claims constraint, or the repo's mapped 409. */
export function isStoreClaimConflict(err: unknown): boolean {
  const e = err as {
    code?: unknown;
    constraint?: unknown;
    cause?: { code?: unknown; constraint?: unknown };
  } | null;
  if (!e) return false;
  if (e.code === 'STORE_CONNECTED_ELSEWHERE') return true;
  const pg = e.code === '23505' ? e : e.cause;
  return (
    pg?.code === '23505' && pg.constraint === STORE_CLAIM_UNIQUE_CONSTRAINT
  );
}

/**
 * Acquire (or re-confirm) the global claim inside the connect/reconnect
 * transaction. Owner = this workspace → returns the claim (reconnect), or
 * 409 ALREADY_CONNECTED when its row is connected. Owner elsewhere, or a
 * lost race → audit in this workspace, then neutral 409.
 */
export async function acquireStoreClaim(
  deps: StoreOwnershipDeps,
  input: AcquireStoreClaimInput
): Promise<StoreClaimRecord> {
  let owner: StoreClaimRecord | null;
  try {
    owner = await deps.claims.acquire({
      provider: input.provider,
      providerStoreId: input.providerStoreId,
      workspaceId: input.workspaceId,
      connectionId: input.connectionId,
      claimedBy: input.actorId,
      claimedAt: input.now,
    });
  } catch (err) {
    if (!isStoreClaimConflict(err)) throw err;
    owner = null;
  }
  if (owner && owner.workspaceId === input.workspaceId) {
    if (input.rowConnected) throw alreadyConnected();
    return owner;
  }
  await deps.audit.append({
    workspaceId: input.workspaceId,
    action: 'integration.connect_blocked',
    category: 'workspace',
    actorId: input.actorId,
    payload: {
      provider: input.provider,
      providerStoreId: input.providerStoreId,
      reason: 'connected_elsewhere',
    },
  });
  throw storeConnectedElsewhere();
}

/** Admin Putuskan / Hapus koneksi only. False when not the owner. */
export async function releaseStoreClaim(
  deps: Pick<StoreOwnershipDeps, 'claims'>,
  input: {
    workspaceId: string;
    provider: MarketplaceProvider;
    providerStoreId: string;
  }
): Promise<boolean> {
  return deps.claims.release(input);
}
