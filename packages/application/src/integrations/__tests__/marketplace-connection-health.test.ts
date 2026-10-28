import {
  CONNECTION_HEALTH_BADGES,
  CONNECTION_HEALTH_WARNING_MS,
  computeConnectionChecklist,
  evaluateConnectionHealth,
  formatTokenExpiryWindowDays,
  type ConnectionHealthInput,
  type MarketplaceCapabilities,
} from '@tokoboss/domain';
import { describe, expect, it } from 'vitest';

/**
 * Connection health badge, ~30-day token window and 5-step setup checklist
 * (UTA-38 / US18, RFC 07 row 3). Domain has no test runner, so the pure
 * rules from rows 1a/1b are covered here.
 */
const DAY = 86_400_000;
const NOW = new Date('2026-10-28T03:00:00.000Z');
const inDays = (d: number) => new Date(NOW.getTime() + d * DAY);

const base: ConnectionHealthInput = {
  status: 'connected',
  orderImportEnabled: true,
  inventorySyncEnabled: true,
  missingPermissions: [],
  authExpiresAt: inDays(24),
  lastErrorCode: null,
  rateLimitedSkuCount: 0,
};
const health = (over: Partial<ConnectionHealthInput>) =>
  evaluateConnectionHealth({ ...base, ...over }, NOW);

const caps = (
  pickup: MarketplaceCapabilities['pickup'],
  labels: MarketplaceCapabilities['labels']
): MarketplaceCapabilities => ({
  order_import: 'supported',
  inventory_sync: 'supported',
  labels,
  webhooks: 'supported',
  pickup,
});

describe('marketplace connection health', () => {
  it('applies the RFC 07 precedence from disconnected down to healthy', () => {
    expect(health({})).toBe('healthy');
    expect(health({ inventorySyncEnabled: false })).toBe('paused_partial');
    expect(health({ orderImportEnabled: false })).toBe('paused_partial');
    expect(
      health({ orderImportEnabled: false, inventorySyncEnabled: false })
    ).toBe('paused_full');
    // expiring_soon (<= 5 days) beats paused_full
    expect(
      health({
        authExpiresAt: inDays(5),
        orderImportEnabled: false,
        inventorySyncEnabled: false,
      })
    ).toBe('expiring_soon');
    expect(health({ authExpiresAt: inDays(5.01) })).toBe('healthy');
    // degraded beats expiring_soon
    expect(health({ authExpiresAt: inDays(2), rateLimitedSkuCount: 2 })).toBe(
      'degraded'
    );
    expect(health({ lastErrorCode: 'MARKETPLACE_UNAVAILABLE' })).toBe(
      'degraded'
    );
    expect(health({ missingPermissions: ['item.write'] })).toBe('degraded');
    expect(health({ lastErrorCode: 'SOMETHING_ELSE' })).toBe('healthy');
    // needs_reauth beats degraded
    expect(
      health({ status: 'needs_reauth', missingPermissions: ['item.write'] })
    ).toBe('needs_reauth');
    expect(health({ authExpiresAt: NOW, rateLimitedSkuCount: 3 })).toBe(
      'needs_reauth'
    );
    // disconnected beats everything
    expect(health({ status: 'disconnected', authExpiresAt: inDays(-1) })).toBe(
      'disconnected'
    );
    expect(CONNECTION_HEALTH_BADGES.expiring_soon).toEqual({
      label: 'Token hampir kedaluwarsa',
      tone: 'warn',
    });
    expect(CONNECTION_HEALTH_BADGES.disconnected.tone).toBe('bad');
  });

  it('formats the ~30-day token window and the 5-day warning edge', () => {
    expect(CONNECTION_HEALTH_WARNING_MS).toBe(5 * DAY);
    expect(formatTokenExpiryWindowDays(inDays(30), NOW)).toBe(
      'Token 30 hari lagi'
    );
    expect(health({ authExpiresAt: inDays(30) })).toBe('healthy');
    expect(formatTokenExpiryWindowDays(inDays(3), NOW)).toBe(
      'Token 3 hari lagi'
    );
    expect(formatTokenExpiryWindowDays(inDays(2.2), NOW)).toBe(
      'Token 3 hari lagi'
    );
    expect(formatTokenExpiryWindowDays(inDays(-1), NOW)).toBe(
      'Token kedaluwarsa'
    );
    expect(formatTokenExpiryWindowDays(NOW, NOW)).toBe('Token kedaluwarsa');
    expect(formatTokenExpiryWindowDays(null, NOW)).toBeNull();
    expect(health({ authExpiresAt: null })).toBe('healthy');
  });

  it('computes the 5-step checklist incl. manual pickup/labels on Blibli', () => {
    const states = (input: Parameters<typeof computeConnectionChecklist>[0]) =>
      computeConnectionChecklist(input).map((s) => s.state);
    const blibli = computeConnectionChecklist({
      status: 'connected',
      health: 'expiring_soon',
      inventorySyncEnabled: false,
      capabilities: caps('manual', 'manual'),
      linkedWarehouseCount: 1,
      mappedSkuCount: 0,
    });
    expect(blibli.map((s) => s.key)).toEqual([
      'oauth_connected',
      'warehouse_linked',
      'sku_mapped',
      'stock_sync_active',
      'pickup_and_labels',
    ]);
    expect(blibli.map((s) => s.state)).toEqual([
      'attention',
      'complete',
      'incomplete',
      'paused',
      'manual',
    ]);
    expect(
      states({
        status: 'connected',
        health: 'healthy',
        inventorySyncEnabled: true,
        capabilities: caps('supported', 'supported'),
        linkedWarehouseCount: 0,
        mappedSkuCount: 4,
      })
    ).toEqual(['complete', 'incomplete', 'complete', 'complete', 'supported']);
    expect(
      states({
        status: 'disconnected',
        health: 'disconnected',
        inventorySyncEnabled: true,
        capabilities: caps('unknown', 'supported'),
        linkedWarehouseCount: 0,
        mappedSkuCount: 4,
      })
    ).toEqual([
      'incomplete',
      'incomplete',
      'complete',
      'incomplete',
      'unknown',
    ]);
    expect(
      states({
        status: 'needs_reauth',
        health: 'needs_reauth',
        inventorySyncEnabled: true,
        capabilities: caps('supported', 'unsupported'),
        linkedWarehouseCount: 2,
        mappedSkuCount: 1,
      })
    ).toEqual(['attention', 'complete', 'complete', 'incomplete', 'manual']);
  });
});
