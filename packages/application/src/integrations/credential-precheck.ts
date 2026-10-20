import type { MarketplaceProvider } from '@tokoboss/domain';
import type { TenancyAuditSink } from '../tenancy/tenancy-ports';
import {
  alreadyConnected,
  connectionNotFound,
  reauthStoreMismatch,
  storeConnectedElsewhere,
} from './integration-errors';
import type { ConnectionRecord } from './integration-port-inputs';
import type { ConnectionStore, StoreClaimStore } from './integration-ports';

/**
 * Blibli connect pre-checks (US20 / RFC 04 task 22b), run before the one
 * validation read so no keys are sent for a store this workspace may not
 * bind. Re-entry (`connectionId`) must target this workspace's row for the
 * same merchant code; a new connect must not duplicate a connected row;
 * a store claimed by another workspace is audited here and gets a 409.
 */

export interface CredentialPrecheckDeps {
  connections: Pick<ConnectionStore, 'find' | 'findByStore'>;
  claims: Pick<StoreClaimStore, 'find'>;
  audit: Pick<TenancyAuditSink, 'append'>;
}

export interface CredentialPrecheckInput {
  workspaceId: string;
  provider: MarketplaceProvider;
  providerStoreId: string;
  connectionId: string | null;
  actorId: string;
}

/** Returns this workspace's existing row for the store, if any. */
export async function precheckCredentialConnect(
  deps: CredentialPrecheckDeps,
  input: CredentialPrecheckInput
): Promise<ConnectionRecord | null> {
  const { workspaceId, provider, providerStoreId, connectionId } = input;
  const row = connectionId
    ? await deps.connections.find(workspaceId, connectionId)
    : await deps.connections.findByStore({
        workspaceId,
        provider,
        providerStoreId,
      });
  if (connectionId) {
    if (!row || row.removedAt || row.provider !== provider) {
      throw connectionNotFound();
    }
    if (row.providerStoreId !== providerStoreId) throw reauthStoreMismatch();
  } else if (row && !row.removedAt && row.status === 'connected') {
    throw alreadyConnected();
  }

  const owner = await deps.claims.find({ provider, providerStoreId });
  if (owner && owner.workspaceId !== workspaceId) {
    await deps.audit.append({
      workspaceId,
      action: 'integration.connect_blocked',
      category: 'workspace',
      actorId: input.actorId,
      payload: { provider, providerStoreId, reason: 'connected_elsewhere' },
    });
    throw storeConnectedElsewhere();
  }
  return row && !row.removedAt ? row : null;
}
