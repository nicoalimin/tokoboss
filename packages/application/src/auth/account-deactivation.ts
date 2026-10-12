import { AuthError } from './auth-errors';
import type { CredentialStore, SessionStore } from './auth-ports';
import type { TenancyAuditSink } from '../tenancy/tenancy-ports';
import { requireUserId } from '../tenancy/tenancy-safety';
import { emitAccountSecurityEvent } from '../tenancy/tenancy-use-cases';

/** US29 / RFC 02 row 21 (C2) — account-level deactivation (US21). */
export interface DeactivateAccountDeps {
  credentials: CredentialStore;
  sessions: SessionStore;
  audit: TenancyAuditSink;
}

export interface DeactivateAccountInput {
  userId: string;
  actorId?: string;
  correlationId?: string;
}

export interface DeactivateAccountResult {
  revokedCount: number;
  authVersion: number;
  alreadyDeactivated: boolean;
}

/**
 * Sets `deactivated_at`, bumps the account `auth_version`, revokes every
 * session of the user (NULL-workspace and workspace-bound rows), and emits
 * `security.account_deactivated`. Re-running keeps the original timestamp
 * but still revokes. Unknown account → `ACCOUNT_NOT_FOUND`. No data deleted.
 */
export async function deactivateAccount(
  deps: DeactivateAccountDeps,
  input: DeactivateAccountInput,
  now = new Date()
): Promise<DeactivateAccountResult> {
  const userId = requireUserId(input.userId);
  const state = await deps.credentials.getAccountState(userId);
  if (!state) throw new AuthError('ACCOUNT_NOT_FOUND', 'Account not found.');

  const alreadyDeactivated = state.deactivatedAt != null;
  if (!alreadyDeactivated) {
    await deps.credentials.setDeactivatedAt(userId, now);
  }
  const authVersion = await deps.credentials.bumpAuthVersion(userId);
  const revokedCount = await deps.sessions.revokeAllByUser(userId, now);

  await emitAccountSecurityEvent(deps.audit, {
    action: 'security.account_deactivated',
    actorId: input.actorId ?? userId,
    correlationId: input.correlationId,
    payload: {
      userId,
      authVersion,
      revokedCount,
      reason: alreadyDeactivated ? 'repeat' : 'account_deactivate',
    },
  });

  return { revokedCount, authVersion, alreadyDeactivated };
}
