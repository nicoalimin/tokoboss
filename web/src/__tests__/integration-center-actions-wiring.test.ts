import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emptyConnectionMetrics,
  type ConnectionView,
} from '@tokoboss/application';
import type { IntegrationConnectionView } from '@tokoboss/contracts';
import { DisconnectDialog } from '../components/integrations/DisconnectDialog';
import { IntegrationCenterLoader } from '../components/integrations/IntegrationCenterLoader';
import type { IntegrationCenterManagementData } from '../components/integrations/IntegrationCenterManagement';
import {
  startCenterReauthorize,
  toggleCenterCapability,
} from '../lib/integration-center-actions';
import {
  toIntegrationKpiSummary,
  toStoreHealthRowView,
} from '../lib/integration-management-views';
import { disconnectIntegrationConnection } from '../lib/integrations-actions-client';
import { CONTROLS_SAVED_NOTICE } from '../lib/use-integration-store-management';

/** US18 / RFC 07 row 45d: Admin overview actions wiring (3 tests). */

type Mgmt = IntegrationCenterManagementData;
const fx = vi.hoisted(() => ({
  role: 'admin' as 'admin' | 'manager',
  stateQueue: [] as unknown[],
  connections: [] as IntegrationConnectionView[],
  overview: null as null | {
    kpis: Mgmt['summary'];
    stores: Mgmt['rows'];
    activity: Mgmt['activity'];
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

// prettier-ignore
vi.mock('@/lib/use-membership', () => ({
  useMembership: () => ({
    membership: { workspaceId: 'ws-1', userId: 'u-1', role: fx.role, warehouseScope: null, status: 'active' as const },
    loading: false, signedIn: true,
  }),
}));

vi.mock('@/lib/integrations-client', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/integrations-client')>();
  return {
    ...actual,
    getIntegrationConnections: vi.fn(async () => fx.connections),
    getIntegrationCenterOverview: vi.fn(async () => fx.overview),
  };
});

(globalThis as unknown as { React: typeof React }).React = React;

const NOW = new Date('2026-10-28T11:10:00.000Z');
// prettier-ignore
const connection: ConnectionView = {
  id: 'c-1', workspaceId: 'ws-1', provider: 'shopee', connectMode: 'oauth_redirect',
  providerStoreId: 'shop-1', storeName: 'Toko Row 45d', region: 'ID', status: 'connected',
  disconnectSource: null, disconnectedAt: null, missingPermissions: [], lastErrorCode: null,
  capabilities: { order_import: 'supported', inventory_sync: 'supported', labels: 'supported', webhooks: 'supported', pickup: 'supported' },
  authExpiresAt: new Date('2026-11-21T11:10:00.000Z'), lastCheckedAt: NOW, connectedAt: NOW,
  orderImportEnabled: true, inventorySyncEnabled: true, initialImportStatus: null, connectedBy: null,
};

// prettier-ignore
const listConn = JSON.parse(JSON.stringify({
  ...connection,
  authExpiresAt: connection.authExpiresAt?.toISOString() ?? null,
  lastCheckedAt: connection.lastCheckedAt?.toISOString() ?? null,
  connectedAt: connection.connectedAt?.toISOString() ?? null,
  disconnectedAt: null,
})) as IntegrationConnectionView;

const row = toStoreHealthRowView(
  connection,
  { ...emptyConnectionMetrics('c-1'), mappedSkuCount: 12 },
  NOW
);
const kpis = toIntegrationKpiSummary([row]);
// prettier-ignore
const activity: Mgmt['activity'] = [{
  id: 'act-45d', action: 'integration.connected', connectionId: 'c-1', provider: 'shopee',
  storeName: 'Toko Row 45d', actorId: 'u-1', occurredAt: '2026-10-28T11:10:00.000Z',
  occurredAtWib: '28 Okt 2026, 18.10 WIB', summary: 'Toko terhubung',
}];

type Call = { url: string; method: string; body?: string };
// prettier-ignore
function fakeFetch(routes: Record<string, [number, unknown]>, calls: Call[]) {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: String(init?.method ?? 'GET'), body: init?.body as string | undefined });
    const [status, json] = routes[url] ?? [404, {}];
    return new Response(JSON.stringify(json), { status });
  }) as unknown as typeof fetch;
}

function seedLoader(management: Mgmt | undefined): string {
  fx.connections = [listConn];
  fx.overview = { kpis, stores: [row], activity };
  // prettier-ignore
  fx.stateQueue = [
    { kind: 'ready', connections: [listConn] }, 0, management, undefined,
    { targetId: null, busy: false, failed: false },
  ];
  return renderToStaticMarkup(
    React.createElement(IntegrationCenterLoader, { workspaceId: 'ws-1' })
  );
}

beforeEach(() => {
  fx.stateQueue = [];
  fx.role = 'admin';
});

describe('integration center actions wiring (row 45d)', () => {
  it('45a toggle PATCHes; reauthorize navigates Shopee URL / Blibli store', async () => {
    const calls: Call[] = [];
    const cPath = '/api/workspaces/ws-1/integrations/c-1/controls';
    const rPath = '/api/workspaces/ws-1/integrations/c-1/reauthorize';
    // prettier-ignore
    const fetchFn = fakeFetch({
      [cPath]: [200, { connection: {}, reconciliationQueued: false }],
      [rPath]: [200, { mode: 'oauth_redirect', authorizeUrl: 'https://example.com/oauth', state: 's', expiresAt: '2026-10-28T11:20:00.000Z' }],
    }, calls);
    await expect(
      toggleCenterCapability(
        'ws-1',
        'c-1',
        'inventorySyncEnabled',
        false,
        fetchFn
      )
    ).resolves.toBe(CONTROLS_SAVED_NOTICE);
    // prettier-ignore
    expect(calls[0]).toEqual({ url: cPath, method: 'PATCH', body: JSON.stringify({ inventorySyncEnabled: false }) });
    const nav: string[] = [];
    await startCenterReauthorize('ws-1', row, (u) => nav.push(u), fetchFn);
    expect(nav).toEqual(['https://example.com/oauth']);
    nav.length = 0;
    // prettier-ignore
    const bli = { ...connection, id: 'c-bli', provider: 'blibli' as const, connectMode: 'credential_binding' as const, providerStoreId: 'bli-1', storeName: 'Toko Blibli' };
    await startCenterReauthorize(
      'ws-1',
      toStoreHealthRowView(bli, emptyConnectionMetrics('c-bli'), NOW),
      (u) => nav.push(u),
      fetchFn
    );
    expect(nav).toEqual(['/w/ws-1/integrasi/c-bli']);
  });

  it('disconnect DELETE sends PUTUSKAN; dialog confirm disabled until typed', async () => {
    const calls: Call[] = [];
    const path = '/api/workspaces/ws-1/integrations/c-1';
    await disconnectIntegrationConnection(
      'ws-1',
      'c-1',
      fakeFetch({ [path]: [200, { connection: listConn }] }, calls)
    );
    // prettier-ignore
    expect(calls[0]).toEqual({ url: path, method: 'DELETE', body: JSON.stringify({ confirmationText: 'PUTUSKAN' }) });
    // prettier-ignore
    const html = renderToStaticMarkup(React.createElement(DisconnectDialog, {
      open: true, store: 'Toko Row 45d · Shopee', onConfirm: () => {}, onCancel: () => {},
    }));
    expect(html).toContain('data-testid="disconnect-dialog"');
    expect(html).toContain('disabled');
  });

  it('Manager omits admin actions/dialog; Admin shows the row action', () => {
    const management = { summary: kpis, rows: [row], activity };
    fx.role = 'manager';
    const mgr = seedLoader(management);
    expect(mgr).not.toContain('store-health-admin-action');
    expect(mgr).not.toContain('store-drawer-admin-action');
    expect(mgr).not.toContain('disconnect-dialog');
    fx.role = 'admin';
    const adm = seedLoader(management);
    expect(adm).toContain('data-testid="store-health-admin-action"');
    expect(adm).toContain('Putuskan');
  });
});
