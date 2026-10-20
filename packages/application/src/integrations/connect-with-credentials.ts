import {
  MARKETPLACE_CONNECT_MODES,
  type MarketplaceConnector,
  type MarketplaceProvider,
} from '@tokoboss/domain';
import type { WorkspaceContext } from '../tenancy/tenancy-types';
import {
  parseCredentialBinding,
  validateBindingCredentials,
  type CredentialBindingForm,
} from './credential-binding';
import {
  precheckCredentialConnect,
  type CredentialPrecheckDeps,
} from './credential-precheck';
import { integrationValidation } from './integration-errors';
import {
  assertIntegrationWrite,
  requireEnabledProvider,
} from './integration-guards';
import type { ConnectionRecord } from './integration-port-inputs';
import type * as ports from './integration-ports';
import { acquireStoreClaim } from './store-ownership';

export interface ConnectWithCredentialsTx {
  connections: Pick<ports.ConnectionStore, 'upsert'>;
  claims: ports.StoreClaimStore;
  vault: Pick<ports.CredentialVault, 'seal'>;
}

export interface ConnectWithCredentialsDeps extends CredentialPrecheckDeps {
  connectorFor(provider: MarketplaceProvider): MarketplaceConnector;
  enabledProviders: readonly MarketplaceProvider[];
  transaction<T>(fn: (tx: ConnectWithCredentialsTx) => Promise<T>): Promise<T>;
  now(): Date;
}

export interface ConnectWithCredentialsInput extends CredentialBindingForm {
  workspaceId: string;
  provider: string;
  connectionId?: string | null; // key re-entry for this workspace's row
}

/**
 * Blibli connect / key re-entry (US20 / RFC 04 task 22c). Admin only:
 * pre-checks, one validation read, then one transaction (upsert row,
 * acquire claim, seal keys). Keys are never returned, logged or audited.
 */
export async function connectWithCredentials(
  deps: ConnectWithCredentialsDeps,
  ctx: WorkspaceContext | null,
  input: ConnectWithCredentialsInput
): Promise<ConnectionRecord> {
  assertIntegrationWrite(ctx, input.workspaceId);
  const { workspaceId } = input;
  const actorId = ctx.userId;
  const provider = requireEnabledProvider(
    input.provider,
    deps.enabledProviders
  );
  if (MARKETPLACE_CONNECT_MODES[provider] !== 'credential_binding') {
    throw integrationValidation('Marketplace ini memakai otorisasi toko.');
  }
  const parsed = parseCredentialBinding(input);
  const { providerStoreId } = parsed;
  await precheckCredentialConnect(deps, {
    workspaceId,
    provider,
    providerStoreId,
    connectionId: input.connectionId ?? null,
    actorId,
  });
  const connector = deps.connectorFor(provider);
  await validateBindingCredentials(connector, provider, parsed);

  return deps.transaction(async (tx) => {
    const now = deps.now();
    const saved = await tx.connections.upsert({
      workspaceId,
      provider,
      connectMode: 'credential_binding',
      shop: parsed.shop,
      grantedScopes: [],
      accessTokenExpiresAt: null,
      authExpiresAt: null,
      connectedBy: actorId,
      connectedAt: now,
    });
    const claimDeps = { claims: tx.claims, audit: deps.audit };
    await acquireStoreClaim(claimDeps, {
      workspaceId,
      connectionId: saved.id,
      provider,
      providerStoreId,
      actorId,
      now,
      rowConnected: false,
    });
    await tx.vault.seal(saved.id, 'blibli_keys', parsed.credentials);
    return saved;
  });
}
