import { BusinessRuleViolationError } from '../errors/domain-error';
import {
  MARKETPLACE_CAPABILITY_KEYS,
  type MarketplaceCapabilities,
  type MarketplaceConnectionStatus,
  type MarketplaceDisconnectSource,
} from './marketplace-connection';

/**
 * Marketplace connection rules (UTA-39 / US20, RFC 04 task 11).
 *
 * Pure rules for the connection-status table, the store-claim release rule
 * and capability / missing-permission derivation. No I/O.
 */
export const MARKETPLACE_STATUS_TRANSITIONS: Readonly<
  Record<MarketplaceConnectionStatus, readonly MarketplaceConnectionStatus[]>
> = {
  connected: ['needs_reauth', 'disconnected'],
  needs_reauth: ['connected', 'disconnected'],
  disconnected: ['connected'],
};

export function canTransitionMarketplaceConnection(
  from: MarketplaceConnectionStatus,
  to: MarketplaceConnectionStatus
): boolean {
  return MARKETPLACE_STATUS_TRANSITIONS[from].includes(to);
}

export function assertMarketplaceTransition(
  from: MarketplaceConnectionStatus,
  to: MarketplaceConnectionStatus
): void {
  if (!canTransitionMarketplaceConnection(from, to)) {
    throw new BusinessRuleViolationError(
      `Marketplace connection cannot move from ${from} to ${to}`
    );
  }
}

/** Hapus koneksi is allowed only from Terputus (disconnected). */
export function canRemoveMarketplaceConnection(
  status: MarketplaceConnectionStatus
): boolean {
  return status === 'disconnected';
}

/** Only an Admin Putuskan releases the claim; seller/provider keep it. */
export function disconnectReleasesClaim(
  source: MarketplaceDisconnectSource
): boolean {
  return source === 'admin';
}

/** Authorization expiring within 14 days counts as Perlu otorisasi ulang. */
export const MARKETPLACE_REAUTH_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function isAuthorizationExpiring(
  expiresAt: Date | null,
  now: Date
): boolean {
  if (expiresAt === null) return false;
  return expiresAt.getTime() - now.getTime() <= MARKETPLACE_REAUTH_WINDOW_MS;
}

/** Required scopes not granted, in required order, without duplicates. */
export function deriveMissingPermissions(
  requiredScopes: readonly string[],
  grantedScopes: readonly string[]
): string[] {
  const granted = new Set(grantedScopes);
  return [...new Set(requiredScopes)].filter((scope) => !granted.has(scope));
}

/** Fills every capability key; anything not reported stays `unknown`. */
export function deriveCapabilities(
  reported: Partial<MarketplaceCapabilities>
): MarketplaceCapabilities {
  const result = {} as MarketplaceCapabilities;
  for (const key of MARKETPLACE_CAPABILITY_KEYS) {
    result[key] = reported[key] ?? 'unknown';
  }
  return result;
}

/** Verified credentials: connected unless a permission is missing or expiring. */
export function statusAfterVerification(input: {
  missingPermissions: readonly string[];
  expiresAt: Date | null;
  now: Date;
}): MarketplaceConnectionStatus {
  if (input.missingPermissions.length > 0) return 'needs_reauth';
  if (isAuthorizationExpiring(input.expiresAt, input.now))
    return 'needs_reauth';
  return 'connected';
}
