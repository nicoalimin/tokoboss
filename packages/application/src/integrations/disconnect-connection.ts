import { assertMarketplaceTransition } from '@tokoboss/domain';
import type { TenancyAuditSink } from '../tenancy/tenancy-ports';
import type { WorkspaceContext } from '../tenancy/tenancy-types';
import { connectionNotFound } from './integration-errors';
import { assertIntegrationWrite } from './integration-guards';
import type { ConnectionRecord } from './integration-port-inputs';
import type * as ports from './integration-ports';

export interface DisconnectConnectionTx {
  connections: Pick<ports.ConnectionStore, 'update'>;
  claims: Pick<ports.StoreClaimStore, 'release'>;
  vault: Pick<ports.CredentialVault, 'shred'>;
}

export interface DisconnectConnectionDeps {
  connections: Pick<ports.ConnectionStore, 'find'>;
  audit: Pick<TenancyAuditSink, 'append'>;
  transaction<T>(fn: (tx: DisconnectConnectionTx) => Promise<T>): Promise<T>;
  now(): Date;
}

export interface DisconnectConnectionInput {
  workspaceId: string;
  connectionId: string;
}

/**
 * Putuskan (US20 / RFC 04 task 26). Admin only. One transaction: mark the
 * row disconnected (source admin), crypto-shred the credentials and
 * release this workspace's store claim. Mappings and order/ledger history
 * are untouched. An already-disconnected row is returned as-is (no audit).
 */
export async function disconnectConnection(
  deps: DisconnectConnectionDeps,
  ctx: WorkspaceContext | null,
  input: DisconnectConnectionInput
): Promise<ConnectionRecord> {
  assertIntegrationWrite(ctx, input.workspaceId);
  const { workspaceId, connectionId } = input;
  const actorId = ctx.userId;
  const row = await deps.connections.find(workspaceId, connectionId);
  if (!row || row.removedAt) throw connectionNotFound();
  if (row.status === 'disconnected') return row;
  assertMarketplaceTransition(row.status, 'disconnected');
  const { provider, providerStoreId } = row;
  const now = deps.now();

  const result = await deps.transaction(async (tx) => {
    const saved = await tx.connections.update({
      workspaceId,
      connectionId,
      expectedVersion: row.version,
      patch: {
        status: 'disconnected',
        disconnectSource: 'admin',
        disconnectedAt: now,
        disconnectedBy: actorId,
        orderImportEnabled: false,
        inventorySyncEnabled: false,
      },
    });
    await tx.vault.shred(connectionId);
    // Only an Admin Putuskan releases; false when this workspace isn't owner.
    const claimReleased = await tx.claims.release({
      workspaceId,
      provider,
      providerStoreId,
    });
    return { saved, claimReleased };
  });

  await deps.audit.append({
    workspaceId,
    action: 'integration.disconnected',
    category: 'workspace',
    actorId,
    payload: {
      connectionId,
      provider,
      providerStoreId,
      source: 'admin',
      claimReleased: result.claimReleased,
    },
  });
  return result.saved;
}
