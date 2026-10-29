import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emptyConnectionMetrics,
  type ConnectionView,
} from '@tokoboss/application';
import {
  toIntegrationKpiSummary,
  toStoreHealthRowView,
} from '@/lib/integration-management-views';
import { resolveIntegrationProblem } from '@/lib/integration-problem-views';
import { ConnectProblem } from '../ConnectProblem';
import { DisconnectDialog } from '../DisconnectDialog';
import { IntegrationCenterManagement } from '../IntegrationCenterManagement';
import { StoreCapabilityControlsCard } from '../StoreCapabilityControlsCard';

/**
 * US18 / RFC 07 row 39: Admin pause / resume + reconcile toast and drawer
 * diagnostics, typed PUTUSKAN guard + different-store re-auth banner, and
 * Manager / Staff read-only. No DOM: static render, direct calls of
 * stateless trees, useState seeded via vi.mock('react').
 */

const fx = vi.hoisted(() => ({ states: [] as unknown[] }));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const useState = (init: unknown) =>
    fx.states.length > 0
      ? [fx.states.shift(), () => {}]
      : actual.useState(init);
  return { ...actual, useState };
});

// Components use the classic JSX runtime under vitest, so expose React.
(globalThis as unknown as { React: typeof React }).React = React;

type Change = (e: { target: { checked: boolean } }) => void;
type El = React.ReactElement<Record<string, unknown> & { children?: unknown }>;

/** Every element of `type` in a stateless component's returned tree. */
function findAll(node: unknown, type: string, out: El[] = []): El[] {
  if (Array.isArray(node)) node.forEach((n) => findAll(n, type, out));
  else if (React.isValidElement<El['props']>(node)) {
    if (node.type === type) out.push(node);
    findAll(node.props.children, type, out);
  }
  return out;
}

const NOW = new Date('2026-10-28T11:10:00.000Z');

function row(over: Partial<ConnectionView> = {}) {
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
    inventorySyncEnabled: true,
    initialImportStatus: null,
    connectedBy: null,
    connectedAt: null,
    ...over,
  };
  const metrics = {
    ...emptyConnectionMetrics(connection.id),
    mappedSkuCount: 12,
    linkedWarehouseCodes: ['GDG-JKT'],
  };
  return toStoreHealthRowView(connection, metrics, NOW);
}

function management(isAdmin: boolean, toast?: string) {
  const rows = [row(), row({ id: 'c-2', inventorySyncEnabled: false })];
  return renderToStaticMarkup(
    <IntegrationCenterManagement
      summary={toIntegrationKpiSummary(rows)}
      rows={rows}
      activity={[]}
      isAdmin={isAdmin}
      actions={{ onToggle: vi.fn(), onDisconnect: vi.fn() }}
      onManageConnection={vi.fn()}
      toast={toast}
    />
  );
}

/** Opening tag of the dialog's first (destructive Putuskan) button. */
const confirmTag = (html: string) => html.split('<button')[1]?.split('>')[0];
const inputs = (html: string, id: string) => [
  ...html.matchAll(new RegExp(`<input[^>]*data-testid="${id}[^>]*>`, 'g')),
];
const DIALOG = { open: true, store: 'Toko Satu', onCancel: () => {} };

beforeEach(() => {
  fx.states.length = 0;
});

describe('integration center management UI (RFC 07 row 39)', () => {
  it('Admin pauses / resumes each capability, reconciles, sees drawer', () => {
    const onChange = vi.fn();
    const paused = row({ inventorySyncEnabled: false });
    const admin = { row: paused, isAdmin: true, onChange };
    const tree = StoreCapabilityControlsCard(admin);
    const switches = findAll(tree, 'input');
    expect(switches.map((i) => i.props['data-testid'])).toEqual([
      'capability-switch-orderImportEnabled',
      'capability-switch-inventorySyncEnabled',
    ]);
    expect(switches.map((i) => i.props.disabled)).toEqual([false, false]);
    (switches[0]?.props.onChange as Change)({ target: { checked: false } });
    (switches[1]?.props.onChange as Change)({ target: { checked: true } });
    const [resume] = findAll(tree, 'button');
    (resume?.props.onClick as () => void)();
    expect(onChange.mock.calls).toEqual([
      [{ orderImportEnabled: false }],
      [{ inventorySyncEnabled: true }],
      [{ inventorySyncEnabled: true, reconcileNow: true }],
    ]);
    const toast = '✅ Sinkron stok dilanjutkan, rekonsiliasi dimulai';
    const card = renderToStaticMarkup(
      <StoreCapabilityControlsCard row={paused} isAdmin notice={toast} />
    );
    expect(card).toContain(toast);
    expect(card).not.toContain('Dampak saat Sinkronisasi Stok dijeda');
    fx.states.push('c-1');
    const html = management(true, toast);
    expect(html).toContain(toast);
    expect(html).toContain('id="storeDrawer"');
    expect(html).toContain('Diagnostik Token (Tanpa Cron');
    expect(html).toContain('Token 24 hari lagi');
    expect(html).toContain('data-testid="store-drawer-admin-action"');
    expect(html).not.toContain('data-testid="integration-center-read-only"');
  });

  it('guards Putuskan behind typed PUTUSKAN; flags a different store', () => {
    const dialog = (typed?: string) => {
      if (typed !== undefined) fx.states.push(typed);
      return renderToStaticMarkup(
        <DisconnectDialog {...DIALOG} onConfirm={vi.fn()} />
      );
    };
    expect(confirmTag(dialog())).toContain('disabled=""');
    expect(confirmTag(dialog('putuskan'))).toContain('disabled=""');
    expect(confirmTag(dialog('PUTUS'))).toContain('disabled=""');
    expect(confirmTag(dialog(' PUTUSKAN '))).not.toContain('disabled=""');
    const banner = renderToStaticMarkup(
      <ConnectProblem
        problem={resolveIntegrationProblem({ result: 'mismatch' })!}
        provider="Shopee"
        isAdmin
        onAction={vi.fn()}
        centerHref="/w/ws-1/integrasi"
      />
    );
    expect(banner).toContain('data-variant="mismatch"');
    expect(banner).toContain('Toko berbeda saat otorisasi ulang');
    expect(banner).not.toContain('<button');
  });

  it('Manager / Staff: read-only badge, switches locked, no mutations', () => {
    fx.states.push('c-1');
    const html = management(false);
    expect(html).toContain('🔒 Manager/Staff: hanya baca');
    expect(html).toContain('🔒 Mode baca-saja untuk Manager/Staff');
    expect(html).not.toContain('data-testid="store-health-admin-action"');
    expect(html).not.toContain('data-testid="store-drawer-admin-action"');
    const ro = { row: row(), isAdmin: false, onChange: vi.fn() };
    const card = renderToStaticMarkup(<StoreCapabilityControlsCard {...ro} />);
    const switches = [
      ...inputs(html, 'store-health-'),
      ...inputs(card, 'capability-switch-'),
    ];
    expect(switches).toHaveLength(6);
    for (const [tag] of switches) expect(tag).toContain('disabled=""');
    expect(card).not.toContain('<button');
    expect(card).toContain('🔒 Hanya Admin yang dapat menjeda/melanjutkan');
  });
});
