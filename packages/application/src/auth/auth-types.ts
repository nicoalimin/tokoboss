/**
 * Credential + session vocabulary for password auth (UTA-67).
 *
 * Product freeze (UTA-17, mirrored from `@tokoboss/auth/session-policy` —
 * this package must not import `@tokoboss/auth` so the application layer
 * keeps its "imports only domain" boundary):
 * - Idle-only sessions: web 30m / mobile 7d. No absolute login expiry.
 * - Unlimited concurrent devices; revoke one / all.
 * - Password min 8 + common-password denylist; no MFA/SSO.
 * - Revoke-all on password reset / Admin deactivate (via membership
 *   `auth_version` bump).
 */

export const SESSION_IDLE_TTL_MS = {
  web: 30 * 60 * 1000,
  mobile: 7 * 24 * 60 * 60 * 1000,
} as const;
export type AuthPlatform = keyof typeof SESSION_IDLE_TTL_MS;

export function isAuthPlatform(value: unknown): value is AuthPlatform {
  return value === 'web' || value === 'mobile';
}

/** Credential row: email login bound to an opaque user id. */
export interface CredentialRecord {
  id: string;
  /** Normalized (trimmed, lowercased) email. Never logged. */
  email: string;
  /** Opaque user id shared with `workspace_members.user_id`. */
  userId: string;
  /** Opaque password hash (scrypt). Never logged, never returned. */
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Server-side session row. Only the token *hash* is stored. */
export interface SessionRecord {
  id: string;
  userId: string;
  workspaceId: string;
  platform: AuthPlatform;
  deviceLabel: string | null;
  /** Hex sha256 of the opaque bearer token. Never logged. */
  tokenHash: string;
  /** Membership `auth_version` captured at sign-in. */
  authVersion: number;
  lastSeenAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

/** Password-reset ticket. Only the token *hash* is stored. */
export interface PasswordResetRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

/** Client-safe session projection (no hashes, no tokens). */
export interface SessionView {
  id: string;
  platform: AuthPlatform;
  deviceLabel: string | null;
  authVersion: number;
  lastSeenAt: string;
  createdAt: string;
}

export function toSessionView(s: SessionRecord): SessionView {
  return {
    id: s.id,
    platform: s.platform,
    deviceLabel: s.deviceLabel,
    authVersion: s.authVersion,
    lastSeenAt: s.lastSeenAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
  };
}
