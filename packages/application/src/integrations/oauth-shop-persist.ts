import {
  statusAfterVerification,
  type MarketplaceConnector,
  type MarketplaceCredentials,
  type MarketplaceProvider,
  type MarketplaceShop,
} from '@tokoboss/domain';
import type { TenancyAuditSink } from '../tenancy/tenancy-ports';
import type { ConnectionRecord } from './integration-port-inputs';
import type * as ports from './integration-ports';
import * as reauth from './reauthorize-connection';
import { acquireStoreClaim } from './store-ownership';

/**
 * Persist one authorized OAuth shop (US20 / RFC 04 task 21, split 21c),
 * after the caller's pre-checks. One tx: upsert this workspace's row; an
 * existing row → reauthorize-connection (re-acquire claim, unarchive
 * mappings), else first claim; capabilities → connected | needs_reauth;
 * seal tokens last. A blocked claim throws before the seal: new tokens are
 * discarded unsealed, the owner's are never touched. Audited after commit.
 */

export interface OAuthShopPersistTx extends reauth.ReauthorizeConnectionTx {
  connections: Pick<ports.ConnectionStore, 'findByStore' | 'upsert' | 'update'>;
  vault: Pick<ports.CredentialVault, 'seal'>;
}

export interface OAuthShopPersistDeps {
  audit: Pick<TenancyAuditSink, 'append'>;
  transaction<T>(fn: (tx: OAuthShopPersistTx) => Promise<T>): Promise<T>;
  now(): Date;
}

export interface OAuthShopPersistInput {
  workspaceId: string;
  provider: MarketplaceProvider;
  connector: Pick<MarketplaceConnector, 'describeCapabilities'>;
  shop: MarketplaceShop;
  credentials: MarketplaceCredentials;
  actorId: string;
}

export async function persistOAuthShop(
  deps: OAuthShopPersistDeps,
  input: OAuthShopPersistInput
): Promise<ConnectionRecord> {
  const { workspaceId, provider, shop, credentials: creds, actorId } = input;
  const key = { workspaceId, provider, providerStoreId: shop.providerStoreId };
  const now = deps.now();
  const { prev, saved, mappingsUnarchived } = await deps.transaction(
    async (tx) => {
      const prev = await tx.connections.findByStore(key);
      const row = await tx.connections.upsert({
        ...{ workspaceId, provider, shop, connectedBy: actorId },
        connectMode: 'oauth_redirect',
        grantedScopes: [...creds.grantedScopes],
        accessTokenExpiresAt: creds.accessTokenExpiresAt,
        authExpiresAt: creds.authExpiresAt,
        connectedAt: now,
      });
      const claim = { ...key, connectionId: row.id, actorId, now };
      const mappingsUnarchived = prev
        ? (await reauth.applyReauthorization(tx, deps, { ...claim, row }))
            .mappingsUnarchived
        : await acquireStoreClaim(
            { claims: tx.claims, audit: deps.audit },
            { ...claim, rowConnected: false }
          ).then(() => 0);
      const caps = input.connector.describeCapabilities(
        shop,
        creds.grantedScopes
      );
      const missingPermissions = [...caps.missingPermissions];
      const status = statusAfterVerification({
        ...{ missingPermissions, now },
        expiresAt: creds.authExpiresAt,
      });
      const saved = await tx.connections.update({
        ...{ workspaceId, connectionId: row.id, expectedVersion: row.version },
        patch: { capabilities: caps.capabilities, missingPermissions, status },
      });
      await tx.vault.seal(saved.id, 'oauth_tokens', creds);
      return { prev, saved, mappingsUnarchived };
    }
  );
  if (prev) {
    const row = { ...prev, id: saved.id };
    await reauth.auditReauthorization(deps, {
      ...{ row, actorId, saved, mappingsUnarchived },
    });
  } else {
    await deps.audit.append({
      ...{ workspaceId, actorId, category: 'workspace' },
      action: 'integration.connected',
      payload: { connectionId: saved.id, ...key, status: saved.status },
    });
  }
  return saved;
}
