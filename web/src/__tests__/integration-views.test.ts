import { describe, expect, it } from 'vitest';
import type { IntegrationConnectionView } from '@tokoboss/contracts';
import {
  groupConnectionsByProvider,
  integrationCapabilityLabels,
  integrationStatusBadge,
} from '../lib/integration-views';
import {
  parseIntegrationCallbackResult,
  resolveIntegrationProblem,
} from '../lib/integration-problem-views';

/**
 * US20 / RFC 04 task 103: pure Integration Center view helpers — provider
 * grouping, status badge + capability labels (102a) and the screen-4
 * problem-variant resolver (102b). No fetch, no React.
 */

function connection(
  over: Partial<IntegrationConnectionView> = {}
): IntegrationConnectionView {
  return {
    id: 'conn-1',
    workspaceId: 'ws-1',
    provider: 'shopee',
    connectMode: 'oauth_redirect',
    providerStoreId: 'shop-1',
    storeName: 'Toko Satu',
    region: 'ID',
    status: 'connected',
    disconnectSource: null,
    disconnectedAt: null,
    capabilities: {
      order_import: 'supported',
      inventory_sync: 'manual',
      labels: 'unsupported',
      webhooks: 'supported',
      pickup: 'unknown',
    },
    missingPermissions: [],
    authExpiresAt: null,
    lastCheckedAt: null,
    lastErrorCode: null,
    orderImportEnabled: false,
    inventorySyncEnabled: false,
    initialImportStatus: null,
    connectedBy: null,
    connectedAt: null,
    ...over,
  };
}

describe('integration views', () => {
  it('groups stores under all three providers in mockup order', () => {
    const a = connection({ id: 'a', provider: 'blibli' });
    const b = connection({ id: 'b', provider: 'shopee' });
    const c = connection({ id: 'c', provider: 'blibli' });
    const groups = groupConnectionsByProvider([a, b, c]);
    expect(groups.map((g) => g.provider)).toEqual([
      'shopee',
      'tiktok_shop',
      'blibli',
    ]);
    expect(groups[0]?.connections.map((x) => x.id)).toEqual(['b']);
    expect(groups[1]?.connections).toEqual([]);
    expect(groups[2]?.connections.map((x) => x.id)).toEqual(['a', 'c']);
    expect(
      groupConnectionsByProvider([]).every((g) => !g.connections.length)
    ).toBe(true);
  });

  it('maps the four statuses to badge label + tone and lists capabilities', () => {
    expect(integrationStatusBadge('not_connected')).toEqual({
      status: 'not_connected',
      label: 'Belum terhubung',
      tone: 'neutral',
    });
    expect(integrationStatusBadge('connected').tone).toBe('ok');
    expect(integrationStatusBadge('needs_reauth')).toEqual({
      status: 'needs_reauth',
      label: 'Perlu otorisasi ulang',
      tone: 'warn',
    });
    expect(integrationStatusBadge('disconnected', 'en')).toEqual({
      status: 'disconnected',
      label: 'Disconnected',
      tone: 'bad',
    });
    const labels = integrationCapabilityLabels(connection());
    expect(labels.map((l) => [l.key, l.label, l.state])).toEqual([
      ['order_import', 'impor order', 'supported'],
      ['inventory_sync', 'sinkron stok', 'manual'],
      ['labels', 'label', 'unsupported'],
      ['webhooks', 'webhook', 'supported'],
      ['pickup', 'pickup', 'unknown'],
    ]);
    expect(integrationCapabilityLabels(connection(), 'en')[0]?.label).toBe(
      'order import'
    );
  });

  it('resolves the problem variant from ?result= and the stored status', () => {
    expect(parseIntegrationCallbackResult('blocked')).toBe('blocked');
    for (const raw of ['nope', '', ['blocked', 'mismatch'], null, undefined]) {
      expect(parseIntegrationCallbackResult(raw)).toBeNull();
    }
    for (const result of [
      'cancelled',
      'blocked',
      'mismatch',
      'unavailable',
    ] as const) {
      expect(resolveIntegrationProblem({ result })).toEqual({
        variant: result,
        missingPermissions: [],
      });
    }
    const reauth = connection({ status: 'needs_reauth' });
    expect(resolveIntegrationProblem({ connection: reauth })).toEqual({
      variant: 'token_expired',
      missingPermissions: [],
    });
    expect(
      resolveIntegrationProblem({
        result: 'needs_reauth',
        connection: { ...reauth, missingPermissions: ['logistics', ''] },
      })
    ).toEqual({
      variant: 'permission_missing',
      missingPermissions: ['logistics'],
    });
    expect(
      resolveIntegrationProblem({ result: 'blocked', connection: reauth })
    ).toEqual({ variant: 'blocked', missingPermissions: [] });
    expect(
      resolveIntegrationProblem({
        result: 'connected',
        connection: connection(),
      })
    ).toBeNull();
    expect(
      resolveIntegrationProblem({
        connection: connection({ status: 'disconnected' }),
      })
    ).toBeNull();
    expect(resolveIntegrationProblem({ result: 'needs_reauth' })).toBeNull();
    expect(resolveIntegrationProblem({})).toBeNull();
  });
});
