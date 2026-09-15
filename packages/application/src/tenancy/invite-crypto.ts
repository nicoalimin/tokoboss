import { createHash, randomBytes } from 'node:crypto';

/**
 * Invite token helpers (UTA-70).
 *
 * Deliberately local to `tenancy` (not imported from `auth/crypto`):
 * the auth module imports tenancy (`emitSecurityEvent`), so tenancy
 * importing auth would be a cycle. Construction matches the auth module
 * exactly — 32 random bytes, base64url bearer; sha256 hex at rest.
 */

/** Mint an opaque invite token (returned once, never stored). */
export function mintInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

/** sha256 hex of an opaque invite token — what the DB stores. */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
