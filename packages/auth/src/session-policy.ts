/**
 * Session + RBAC policy (UTA-17 freeze, UTA-19 baseline).
 *
 * - RBAC roles: Admin / Manager / Staff only (lowercase wire values).
 * - Sessions: idle-only expiry — web 30m, mobile 7d. No absolute login
 *   expiry. Unlimited concurrent devices. Revoke-all on password reset /
 *   Admin deactivate (via `auth_version` bump — see
 *   `@tokoboss/application` tenancy use-cases).
 * - MVP security events: successful sign-in, failed sign-in
 *   (rate-limited at the route), password reset, forced sign-out.
 */

export const WORKSPACE_ROLES = ['admin', 'manager', 'staff'] as const;
export type AuthWorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** Idle timeouts (ms). Sliding — refreshed on activity, never absolute. */
export const SESSION_IDLE_TTL_MS = {
  web: 30 * 60 * 1000,
  mobile: 7 * 24 * 60 * 60 * 1000,
} as const;
export type SessionPlatform = keyof typeof SESSION_IDLE_TTL_MS;

export interface VersionedSessionClaims {
  userId: string;
  workspaceId: string;
  role: AuthWorkspaceRole;
  /** Membership `auth_version` captured at sign-in / refresh. */
  authVersion: number;
  /** Last activity timestamp (idle clock). */
  lastActiveAt: number;
  issuedAt: number;
  platform: SessionPlatform;
}

/** True when the idle window has elapsed (sliding expiry). */
export function isSessionIdleExpired(
  claims: Pick<VersionedSessionClaims, 'lastActiveAt' | 'platform'>,
  nowMs = Date.now()
): boolean {
  const ttl = SESSION_IDLE_TTL_MS[claims.platform] ?? SESSION_IDLE_TTL_MS.web;
  return nowMs - claims.lastActiveAt >= ttl;
}

/**
 * True when the session's captured `auth_version` no longer matches the
 * current membership row (role/scope/status change, password reset,
 * Admin-deactivate revoke-all). Stale sessions are rejected even if idle
 * time remains.
 */
export function isSessionAuthStale(
  sessionAuthVersion: number,
  currentAuthVersion: number
): boolean {
  return sessionAuthVersion !== currentAuthVersion;
}

/** Session is usable only when idle-fresh AND auth-current. */
export function isSessionValid(
  claims: VersionedSessionClaims,
  currentAuthVersion: number,
  nowMs = Date.now()
): boolean {
  if (isSessionAuthStale(claims.authVersion, currentAuthVersion)) return false;
  if (isSessionIdleExpired(claims, nowMs)) return false;
  return true;
}

/** Refresh the idle clock on activity (no absolute expiry). */
export function touchSession(
  claims: VersionedSessionClaims,
  nowMs = Date.now()
): VersionedSessionClaims {
  return { ...claims, lastActiveAt: nowMs };
}
