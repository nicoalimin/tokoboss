import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emptyConnectionMetrics,
  type ConnectionView,
} from '@tokoboss/application';
import type { IntegrationConnectionView } from '@tokoboss/contracts';
import { IntegrationCenterLoader } from '../components/integrations/IntegrationCenterLoader';
import type { IntegrationCenterManagementData } from '../components/integrations/IntegrationCenterManagement';
import {
  toIntegrationKpiSummary,
  toStoreHealthRowView,
} from '../lib/integration-management-views';

/**
 * US18 / RFC 07 addendum row 44k: Integration Center overview wiring.
 * When the overview client is mocked to resolve, static render shows the
 * KPI bar + store health table; when the overview rejects, the panel
 * renders without `management` and the provider list still shows (fail
 * soft from 44j). Loader post-fetch state is seeded via `useState` mock
 * (effects no-op under SSR); membership + clients are mocked.
 */

const fx = vi.hoisted(() => ({
  overviewOk: true,
  stateQueue: [] as unknown[],
  connections: [] as IntegrationConnectionView[],
  overview: null as null | {
    kpis: IntegrationCenterManagementData['summary'];
    stores: IntegrationCenterManagementData['rows'];
    activity: IntegrationCenterManagementData['activity'];
  },
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const useState = (init: unknown) =>
    fx.stateQueue.length > 0
      ? ([fx.stateQueue.shift(), () => {}] as const)
      : actual.useState(init);
  return { ...actual, useState, useEffect: () => {} };
});

vi.mock('@/lib/use-membership', () => ({
  useMembership: () => ({
    membership: {
      workspaceId: 'ws-1',
      userId: 'u-1',
      role: 'admin' as const,
      warehouseScope: null,
      status: 'active' as const,
    },
    loading: false,
    signedIn: true,
  }),
}));

vi.mock('@/lib/integrations-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/integrations-client')>();
  return {
    ...actual,
    getIntegrationConnections: vi.fn(async () => fx.connections),
    getIntegrationCenterOverview: vi.fn(async () => {
      if (!fx.overviewOk) throw new Error('overview failed');
      return fx.overview;
    }),
  };
});

(globalThis as unknown as { React: typeof React }).React = React;

const NOW = new Date('2026-10-28T11:10:00.000Z');

const connection: ConnectionView = {
  id: 'c-1',
  workspaceId: 'ws-1',
  provider: 'shopee',
  connectMode: 'oauth_redirect',
  providerStoreId: 'shop-1',
  storeName: 'Toko Row 44k',
  region: 'ID',
  status: 'connected',
  disconnectSource: null,
  disconnectedAt: null,
  capabilities: {
    order_import: 'supported',
    inventory_sync: 'supported',
    labels: 'supported',
    webhooks: 'supported',
    pickup: 'supported',
  },
  missingPermissions: [],
  authExpiresAt: new Date('2026-11-21T11:10:00.000Z'),
  lastCheckedAt: NOW,
  lastErrorCode: null,
  orderImportEnabled: true,
  inventorySyncEnabled: true,
  initialImportStatus: null,
  connectedBy: null,
  connectedAt: NOW,
};

const listConn = JSON.parse(
  JSON.stringify({
    ...connection,
    authExpiresAt: connection.authExpiresAt?.toISOString() ?? null,
    lastCheckedAt: connection.lastCheckedAt?.toISOString() ?? null,
    connectedAt: connection.connectedAt?.toISOString() ?? null,
    disconnectedAt: null,
  })
) as IntegrationConnectionView;

const metrics = {
  ...emptyConnectionMetrics('c-1'),
  mappedSkuCount: 12,
  linkedWarehouseCount: 1,
  linkedWarehouseCodes: ['GDG-JKT'],
};
const row = toStoreHealthRowView(connection, metrics, NOW);
const kpis = toIntegrationKpiSummary([row]);
const activity = [
  {
    id: 'act-44k',
    action: 'integration.connected' as const,
    connectionId: 'c-1',
    provider: 'shopee' as const,
    storeName: 'Toko Row 44k',
    actorId: 'u-1',
    occurredAt: '2026-10-28T11:10:00.000Z',
    occurredAtWib: '28 Okt 2026, 18.10 WIB',
    summary: 'Toko terhubung',
  },
];

function seedLoader(
  management: IntegrationCenterManagementData | undefined
): string {
  fx.connections = [listConn];
  fx.overview = { kpis, stores: [row], activity };
  // IntegrationCenterLoader useState order: LoadState, attempt, management.
  fx.stateQueue = [{ kind: 'ready', connections: [listConn] }, 0, management];
  return renderToStaticMarkup(
    React.createElement(IntegrationCenterLoader, { workspaceId: 'ws-1' })
  );
}

beforeEach(() => {
  fx.stateQueue = [];
  fx.overviewOk = true;
});

describe('integration center overview wiring (row 44k)', () => {
  it('shows the KPI bar + store health table when the overview resolves', () => {
    fx.overviewOk = true;
    const html = seedLoader({ summary: kpis, rows: [row], activity });
    expect(html).toContain('data-testid="integration-center"');
    expect(html).toContain('data-testid="integration-center-management"');
    expect(html).toContain('data-testid="integration-kpi-bar"');
    expect(html).toContain('data-testid="integration-kpi-totalStores"');
    expect(html).toContain('>1</b>');
    expect(html).toContain('data-testid="integration-store-health-table"');
    expect(html).toContain('id="storeTable"');
    expect(html).toContain('Toko Row 44k');
    expect(html).toContain('>12</b>');
  });

  it('renders the list without management when the overview rejects', () => {
    fx.overviewOk = false;
    const html = seedLoader(undefined);
    expect(html).toContain('data-testid="integration-center"');
    expect(html).toContain('data-testid="provider-card"');
    expect(html).toContain('Toko Row 44k');
    expect(html).not.toContain('integration-center-management');
    expect(html).not.toContain('integration-kpi-bar');
    expect(html).not.toContain('id="storeTable"');
  });
});
