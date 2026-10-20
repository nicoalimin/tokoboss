import {
  BusinessRuleViolationError,
  MARKETPLACE_CONNECTION_STATUSES,
  MARKETPLACE_REAUTH_WINDOW_MS,
  assertMarketplaceTransition,
  canRemoveMarketplaceConnection,
  canTransitionMarketplaceConnection,
  deriveCapabilities,
  deriveMissingPermissions,
  disconnectReleasesClaim,
  isAuthorizationExpiring,
  statusAfterVerification,
  type MarketplaceConnectionStatus,
} from '@tokoboss/domain';
import { describe, expect, it } from 'vitest';

/**
 * Domain rules for marketplace connections (UTA-39 / US20, RFC 04 task 37).
 * The domain package has no test runner, so the rules are covered here.
 */
describe('marketplace connection rules', () => {
  it('allows only the RFC status transitions and remove from disconnected', () => {
    const allowed: Record<MarketplaceConnectionStatus, string[]> = {
      connected: ['needs_reauth', 'disconnected'],
      needs_reauth: ['connected', 'disconnected'],
      disconnected: ['connected'],
    };
    for (const from of MARKETPLACE_CONNECTION_STATUSES) {
      for (const to of MARKETPLACE_CONNECTION_STATUSES) {
        const ok = allowed[from].includes(to);
        expect(canTransitionMarketplaceConnection(from, to)).toBe(ok);
        if (ok) {
          expect(() => assertMarketplaceTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertMarketplaceTransition(from, to)).toThrow(
            BusinessRuleViolationError
          );
        }
      }
    }
    expect(canRemoveMarketplaceConnection('disconnected')).toBe(true);
    expect(canRemoveMarketplaceConnection('connected')).toBe(false);
    expect(canRemoveMarketplaceConnection('needs_reauth')).toBe(false);
  });

  it('releases the store claim only on an admin disconnect', () => {
    expect(disconnectReleasesClaim('admin')).toBe(true);
    expect(disconnectReleasesClaim('seller')).toBe(false);
    expect(disconnectReleasesClaim('provider')).toBe(false);
  });

  it('derives missing permissions, capabilities and verified status', () => {
    expect(
      deriveMissingPermissions(
        ['orders.read', 'items.read', 'orders.read', 'logistics'],
        ['items.read']
      )
    ).toEqual(['orders.read', 'logistics']);
    expect(deriveMissingPermissions(['items.read'], ['items.read'])).toEqual(
      []
    );

    expect(
      deriveCapabilities({ order_import: 'supported', labels: 'manual' })
    ).toEqual({
      order_import: 'supported',
      inventory_sync: 'unknown',
      labels: 'manual',
      webhooks: 'unknown',
      pickup: 'unknown',
    });

    const now = new Date('2026-10-20T00:00:00.000Z');
    const inWindow = new Date(now.getTime() + MARKETPLACE_REAUTH_WINDOW_MS);
    const later = new Date(now.getTime() + MARKETPLACE_REAUTH_WINDOW_MS + 1);
    expect(isAuthorizationExpiring(null, now)).toBe(false);
    expect(isAuthorizationExpiring(inWindow, now)).toBe(true);
    expect(isAuthorizationExpiring(later, now)).toBe(false);

    expect(
      statusAfterVerification({ missingPermissions: [], expiresAt: later, now })
    ).toBe('connected');
    expect(
      statusAfterVerification({
        missingPermissions: ['orders.read'],
        expiresAt: null,
        now,
      })
    ).toBe('needs_reauth');
    expect(
      statusAfterVerification({
        missingPermissions: [],
        expiresAt: inWindow,
        now,
      })
    ).toBe('needs_reauth');
  });
});
