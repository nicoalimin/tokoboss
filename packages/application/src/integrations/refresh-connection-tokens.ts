import {
  MarketplaceConnectorError,
  type MarketplaceConnector,
  type MarketplaceCredentials,
  type MarketplaceProvider,
} from '@tokoboss/domain';
import type { TenancyAuditSink } from '../tenancy/tenancy-ports';
import type { ConnectionRecord } from './integration-port-inputs';
import type * as ports from './integration-ports';

/** Refresh tokens that expire within 60 minutes (RFC 04, 15-min Cron). */
export const TOKEN_REFRESH_WINDOW_MS = 60 * 60 * 1000;

export type RefreshOutcome =
  'refreshed' | 'skipped' | 'needs_reauth' | 'retry_later';

export interface RefreshConnectionTokensTx {
  connections: Pick<ports.ConnectionStore, 'update'>;
  vault: Pick<ports.CredentialVault, 'seal'>;
}

export interface RefreshConnectionTokensDeps {
  connections: Pick<ports.ConnectionStore, 'find' | 'update'>;
  vault: Pick<ports.CredentialVault, 'open'>;
  connectorFor(provider: MarketplaceProvider): MarketplaceConnector;
  audit: Pick<TenancyAuditSink, 'append'>;
  transaction<T>(fn: (tx: RefreshConnectionTokensTx) => Promise<T>): Promise<T>;
  now(): Date;
}

function isRefreshDue(row: ConnectionRecord, now: Date): boolean {
  if (row.status !== 'connected' || row.removedAt) return false;
  if (row.connectMode !== 'oauth_redirect') return false;
  const expiresAt = row.accessTokenExpiresAt;
  return (
    !!expiresAt &&
    expiresAt.getTime() - now.getTime() <= TOKEN_REFRESH_WINDOW_MS
  );
}

/**
 * Refresh one connection's OAuth tokens (US20 / RFC 04 task 23). Single
 * flight via a version-guarded lease write before the provider call; the
 * rotated tokens are sealed with the row update. Invalid grant →
 * needs_reauth (audited once); transient errors keep the status.
 */
export async function refreshConnectionTokens(
  deps: RefreshConnectionTokensDeps,
  input: { workspaceId: string; connectionId: string }
): Promise<RefreshOutcome> {
  const { workspaceId, connectionId } = input;
  const now = deps.now();
  const row = await deps.connections.find(workspaceId, connectionId);
  if (!row || !isRefreshDue(row, now)) return 'skipped';
  const credentials = await deps.vault.open(connectionId);
  if (!credentials) return 'skipped'; // shredded by a racing Putuskan
  const ref = { workspaceId, connectionId };
  const leased = await deps.connections
    .update({
      ...ref,
      expectedVersion: row.version,
      patch: { lastCheckedAt: now },
    })
    .catch(() => null);
  if (!leased) return 'skipped'; // another run holds this refresh
  const { provider, providerStoreId } = row;
  const connector = deps.connectorFor(provider);
  let next: MarketplaceCredentials;
  try {
    next = await connector.refresh({ provider, shop: row, credentials });
  } catch (err) {
    if (!(err instanceof MarketplaceConnectorError)) throw err;
    if (err.kind !== 'auth_invalid') return 'retry_later';
    await deps.connections.update({
      ...ref,
      expectedVersion: leased.version,
      patch: { status: 'needs_reauth', lastErrorCode: err.code },
    });
    await deps.audit.append({
      workspaceId,
      action: 'integration.token_refresh_failed',
      category: 'workspace',
      actorType: 'system',
      payload: { connectionId, provider, providerStoreId },
    });
    return 'needs_reauth';
  }

  await deps.transaction(async (tx) => {
    await tx.connections.update({
      ...ref,
      expectedVersion: leased.version,
      patch: {
        accessTokenExpiresAt: next.accessTokenExpiresAt,
        authExpiresAt: next.authExpiresAt ?? row.authExpiresAt,
        lastRefreshedAt: now,
        lastErrorCode: null,
      },
    });
    await tx.vault.seal(connectionId, 'oauth_tokens', next);
  });
  return 'refreshed';
}
