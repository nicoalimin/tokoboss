import {
  isAuthorizationExpiring,
  type MarketplaceCredentials,
} from '@tokoboss/domain';
import type { ConnectionRecord } from './integration-port-inputs';
import {
  TOKEN_REFRESH_WINDOW_MS,
  refreshConnectionTokens,
  type RefreshConnectionTokensDeps,
} from './refresh-connection-tokens';
import { AUTH_EXPIRING_ERROR_CODE } from './sweep-connection-expiry';

export type EnsureFreshAccessTokenResult =
  | {
      status: 'fresh';
      connection: ConnectionRecord;
      credentials: MarketplaceCredentials;
    }
  | { status: 'needs_reauth' | 'unavailable' | 'retry_later' };

function tokenUsable(row: ConnectionRecord, now: Date): boolean {
  const expiresAt = row.accessTokenExpiresAt;
  return !expiresAt || expiresAt.getTime() > now.getTime();
}

function refreshDue(row: ConnectionRecord, now: Date): boolean {
  const expiresAt = row.accessTokenExpiresAt;
  if (row.connectMode !== 'oauth_redirect' || !expiresAt) return false;
  return expiresAt.getTime() - now.getTime() <= TOKEN_REFRESH_WINDOW_MS;
}

/**
 * Lazy token refresh before an outbound provider call (US20 / RFC 04 task
 * 131; no crons, Nico 2026-10-23). Applies the 14-day expiry check on use
 * (→ needs_reauth, audited once), refreshes inside the 60-min window via
 * refreshConnectionTokens (single-flight), then returns the row and the
 * opened credentials. auth_invalid → needs_reauth (seller reauthorizes).
 */
export async function ensureFreshAccessToken(
  deps: RefreshConnectionTokensDeps,
  input: { workspaceId: string; connectionId: string }
): Promise<EnsureFreshAccessTokenResult> {
  const { workspaceId, connectionId } = input;
  const now = deps.now();
  let row = await deps.connections.find(workspaceId, connectionId);
  if (!row || row.removedAt) return { status: 'unavailable' };
  if (row.status === 'needs_reauth') return { status: 'needs_reauth' };
  if (row.status !== 'connected') return { status: 'unavailable' };
  if (isAuthorizationExpiring(row.authExpiresAt, now)) {
    const updated = await deps.connections
      .update({
        workspaceId,
        connectionId,
        expectedVersion: row.version,
        patch: {
          status: 'needs_reauth',
          lastCheckedAt: now,
          lastErrorCode: AUTH_EXPIRING_ERROR_CODE,
        },
      })
      .catch(() => null);
    if (updated) {
      const { provider, providerStoreId } = row;
      await deps.audit.append({
        workspaceId,
        action: 'integration.reauth_required',
        category: 'workspace',
        actorType: 'system',
        payload: {
          connectionId,
          provider,
          providerStoreId,
          reason: 'auth_expiring',
          authExpiresAt: row.authExpiresAt?.toISOString() ?? null,
          missingPermissions: row.missingPermissions,
        },
      });
    }
    return { status: 'needs_reauth' };
  }
  if (refreshDue(row, now)) {
    const outcome = await refreshConnectionTokens(deps, input);
    if (outcome === 'needs_reauth') return { status: 'needs_reauth' };
    row = await deps.connections.find(workspaceId, connectionId);
    if (!row || row.removedAt) return { status: 'unavailable' };
    if (row.status === 'needs_reauth') return { status: 'needs_reauth' };
    if (row.status !== 'connected' || !tokenUsable(row, now))
      return { status: 'retry_later' };
  }
  const credentials = await deps.vault.open(connectionId);
  if (!credentials) return { status: 'unavailable' };
  return { status: 'fresh', connection: row, credentials };
}
