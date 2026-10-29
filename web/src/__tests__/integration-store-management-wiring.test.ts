import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  emptyConnectionMetrics,
  type ConnectionView,
} from '@tokoboss/application';
import { IntegrationStoreBody } from '../components/integrations/IntegrationStoreBody';
import { toStoreHealthRowView } from '../lib/integration-management-views';
import type { IntegrationStoreActions } from '../lib/use-integration-store-actions';
import {
  CONTROLS_RECONCILE_NOTICE,
  CONTROLS_SAVED_NOTICE,
  loadIntegrationStoreManagement,
  saveIntegrationStoreControls,
} from '../lib/use-integration-store-management';

/**
 * US18 / RFC 07 row 42c: store detail wiring. The row 42a loader reads the
 * detail GET + activity feed, the controls save maps the PATCH result to the
 * card notice, and IntegrationStoreBody (row 42b) passes the hook's data to
 * the Story 18 cards. No DOM: fake fetch, static render, hook mocked.
 */

const fx = vi.hoisted(() => ({ hook: {} as Record<string, unknown> }));

vi.mock('../lib/use-integration-store-management', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../lib/use-integration-store-management')
    >();
  return { ...actual, useIntegrationStoreManagement: () => fx.hook };
});

// Components use the classic JSX runtime under vitest, so expose React.
(globalThis as unknown as { React: typeof React }).React = React;

const NOW = new Date('2026-10-28T11:10:00.000Z');

const connection: ConnectionView = {
  id: 'c-1',
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
  inventorySyncEnabled: false,
  initialImportStatus: null,
  connectedBy: null,
  connectedAt: NOW,
};

const health = toStoreHealthRowView(
  connection,
  emptyConnectionMetrics('c-1'),
  NOW
);

const item = { id: 'a-1', connectionId: 'c-1', summary: 'Sinkron stok dijeda' };

type Call = { url: string; method: string; body?: string };

function fakeFetch(routes: Record<string, [number, unknown]>, calls: Call[]) {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, method: String(init.method), body: init.body as string });
    const [status, json] = routes[url] ?? [404, {}];
    return new Response(JSON.stringify(json), { status });
  }) as unknown as typeof fetch;
}

const BASE = '/api/workspaces/ws-1/integrations/c-1';

describe('integration store management wiring (row 42)', () => {
  it('loads the health row and activity feed from the detail + activity GETs', async () => {
    const calls: Call[] = [];
    const routes: Record<string, [number, unknown]> = {
      [BASE]: [200, JSON.parse(JSON.stringify(health))],
      [`${BASE}/activity`]: [200, { items: [item] }],
    };
    const out = await loadIntegrationStoreManagement(
      'ws-1',
      'c-1',
      fakeFetch(routes, calls)
    );
    expect(out.health.health).toEqual(health.health);
    expect(out.health.connection.inventorySyncEnabled).toBe(false);
    expect(out.health.checklist).toEqual(health.checklist);
    expect(out.activity).toEqual([item]);
    expect(calls.map((c) => `${c.method} ${c.url}`).sort()).toEqual([
      `GET ${BASE}`,
      `GET ${BASE}/activity`,
    ]);
  });

  it('saves controls via PATCH and maps the result or error to the notice', async () => {
    const calls: Call[] = [];
    const queued = { connection: {}, reconciliationQueued: true };
    const body = { inventorySyncEnabled: true, reconcileNow: true };
    const ok = fakeFetch({ [`${BASE}/controls`]: [200, queued] }, calls);
    await expect(
      saveIntegrationStoreControls('ws-1', 'c-1', body, ok)
    ).resolves.toBe(CONTROLS_RECONCILE_NOTICE);
    expect(calls[0]).toEqual({
      url: `${BASE}/controls`,
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    const saved = { connection: {}, reconciliationQueued: false };
    const pause = fakeFetch({ [`${BASE}/controls`]: [200, saved] }, calls);
    await expect(
      saveIntegrationStoreControls(
        'ws-1',
        'c-1',
        { orderImportEnabled: false },
        pause
      )
    ).resolves.toBe(CONTROLS_SAVED_NOTICE);
    const denied = [403, { error: 'Hanya Admin', errorCode: 'ROLE_FORBIDDEN' }];
    const no = fakeFetch(
      { [`${BASE}/controls`]: denied as [number, unknown] },
      calls
    );
    await expect(
      saveIntegrationStoreControls('ws-1', 'c-1', body, no)
    ).resolves.toBe('Hanya Admin');
  });

  it('IntegrationStoreBody renders the Story 18 cards from the hook data', () => {
    const onControlsChange = vi.fn();
    fx.hook = {
      health,
      activity: [],
      onControlsChange,
      controlsNotice: CONTROLS_SAVED_NOTICE,
    };
    const view = { ...connection, authExpiresAt: null, lastCheckedAt: null };
    const props = {
      workspaceId: 'ws-1',
      connection: JSON.parse(JSON.stringify(view)),
      isAdmin: true,
      actions: { openDialog: vi.fn() } as unknown as IntegrationStoreActions,
    };
    const html = renderToStaticMarkup(
      React.createElement(IntegrationStoreBody, props)
    );
    expect(html).toContain('data-testid="store-setup-checklist"');
    expect(html).toContain(CONTROLS_SAVED_NOTICE);
    fx.hook = {};
    const bare = renderToStaticMarkup(
      React.createElement(IntegrationStoreBody, props)
    );
    expect(bare).not.toContain('store-setup-checklist');
  });
});
