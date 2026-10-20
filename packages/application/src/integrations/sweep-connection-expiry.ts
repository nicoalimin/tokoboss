import {
  MARKETPLACE_REAUTH_WINDOW_MS,
  isAuthorizationExpiring,
} from '@tokoboss/domain';
import type { TenancyAuditSink } from '../tenancy/tenancy-ports';
import type { ConnectionRecord } from './integration-port-inputs';
import type * as ports from './integration-ports';

/** Recorded on rows the sweep moves to Perlu otorisasi ulang. */
export const AUTH_EXPIRING_ERROR_CODE = 'MARKETPLACE_AUTH_EXPIRING';

export interface SweepConnectionExpiryDeps {
  connections: Pick<ports.ConnectionStore, 'listExpiring' | 'update'>;
  audit: Pick<TenancyAuditSink, 'append'>;
  now(): Date;
}

export interface SweepConnectionExpiryResult {
  checked: number;
  needsReauth: number;
  skipped: number;
}

function isSweepable(row: ConnectionRecord, now: Date): boolean {
  if (row.status !== 'connected' || row.removedAt) return false;
  return isAuthorizationExpiring(row.authExpiresAt, now);
}

/**
 * Expiry sweep (US20 / RFC 04 task 24). Connected rows whose authorization
 * expires within 14 days move to needs_reauth with last_checked_at stamped
 * and one integration.reauth_required audit (transition only). A stale
 * version (a refresh or Putuskan raced the sweep) skips the row.
 */
export async function sweepConnectionExpiry(
  deps: SweepConnectionExpiryDeps
): Promise<SweepConnectionExpiryResult> {
  const now = deps.now();
  const before = new Date(now.getTime() + MARKETPLACE_REAUTH_WINDOW_MS);
  const rows = await deps.connections.listExpiring(before);
  const result = { checked: rows.length, needsReauth: 0, skipped: 0 };
  for (const row of rows) {
    if (!isSweepable(row, now)) {
      result.skipped += 1;
      continue;
    }
    const { id: connectionId, workspaceId, provider, providerStoreId } = row;
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
    if (!updated) {
      result.skipped += 1;
      continue;
    }
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
    result.needsReauth += 1;
  }
  return result;
}
