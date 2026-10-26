import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { IntegrationConnectionView } from '@tokoboss/contracts';
import { IntegrationCenterPanel } from '../components/integrations/IntegrationCenterPanel';

/**
 * US20 / RFC 04 task 126: Integration Center UI (panel 108, mockup v2
 * screen 1) — provider grouping, status badges, Admin-only actions hidden
 * for Manager / Staff, and Minta Admin shown to them instead. Static render.
 */

// Components use the classic JSX runtime under vitest, so expose React.
(globalThis as unknown as { React: typeof React }).React = React;

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

const STORES: IntegrationConnectionView[] = [
  connection({
    id: 'c-blibli',
    provider: 'blibli',
    connectMode: 'credential_binding',
    providerStoreId: 'BLI-9',
    storeName: null,
    status: 'disconnected',
  }),
  connection({
    id: 'c-ok',
    providerStoreId: 'shop-1',
    storeName: 'Toko Satu',
    lastCheckedAt: '2026-10-26T10:02:00.000Z',
  }),
  connection({
    id: 'c-reauth',
    providerStoreId: 'shop-2',
    storeName: 'Toko Dua',
    status: 'needs_reauth',
  }),
];

const BASE = '/w/ws-1/integrasi';

function render(isAdmin: boolean): string {
  return renderToStaticMarkup(
    React.createElement(IntegrationCenterPanel, {
      connections: STORES,
      isAdmin,
      connectHref: `${BASE}/hubungkan`,
      storeHrefBase: BASE,
    })
  );
}

/** Inner HTML of each provider card, keyed by `data-provider`. */
function cards(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of html.split('data-testid="provider-card"').slice(1)) {
    const provider = /data-provider="([a-z_]+)"/.exec(part)?.[1] ?? '?';
    out[provider] = part.split('</section>')[0] ?? '';
  }
  return out;
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe('integration center UI (task 126)', () => {
  it('groups stores into the three provider cards with status badges', () => {
    const html = render(true);
    expect(html).toContain('Pusat integrasi');
    expect(Object.keys(cards(html))).toEqual([
      'shopee',
      'tiktok_shop',
      'blibli',
    ]);
    const { shopee, tiktok_shop, blibli } = cards(html);
    expect(count(shopee ?? '', 'data-testid="store-row"')).toBe(2);
    expect(shopee).toContain('2 toko');
    expect(shopee).toContain('Toko Satu');
    expect(shopee).toContain('cek 17:02 WIB');
    expect(shopee).toContain('data-status="connected"');
    expect(shopee).toContain('Perlu otorisasi ulang');
    expect(tiktok_shop).toContain('0 toko');
    expect(tiktok_shop).toContain('data-testid="provider-card-empty"');
    expect(tiktok_shop).toContain('Belum ada toko');
    expect(tiktok_shop).toContain('Belum terhubung');
    expect(blibli).toContain('1 toko');
    expect(blibli).toContain('BLI-9');
    expect(blibli).toContain('Terputus');
    const legend =
      html.split('data-testid="integration-center-legend"')[1] ?? '';
    const legendBadges = legend.split('data-testid="provider-card"')[0] ?? '';
    expect(
      [...legendBadges.matchAll(/data-status="([a-z_]+)"/g)].map((m) => m[1])
    ).toEqual(['not_connected', 'connected', 'needs_reauth', 'disconnected']);
  });

  it('gives an Admin the connect CTA and store actions, no Minta Admin', () => {
    const html = render(true);
    expect(html).toContain('data-testid="integration-center-connect"');
    expect(html).toContain('+ Hubungkan toko');
    expect(html).toContain(`href="${BASE}/hubungkan"`);
    expect(html).not.toContain('data-testid="integration-center-admin-only"');
    expect(html).not.toContain('data-testid="ask-admin"');
    const { shopee, tiktok_shop, blibli } = cards(html);
    expect(shopee).toContain('+ Toko lain');
    expect(shopee).toContain('Otorisasi ulang');
    expect(shopee).toContain(`href="${BASE}/c-reauth"`);
    expect(count(shopee ?? '', 'data-testid="store-row-action"')).toBe(1);
    expect(tiktok_shop).toContain('Hubungkan TikTok Shop');
    expect(blibli).toContain('Lihat &amp; hubungkan lagi');
    expect(blibli).toContain(`href="${BASE}/c-blibli"`);
  });

  it('hides Admin actions from Manager / Staff and shows Minta Admin', () => {
    const html = render(false);
    expect(html).not.toContain('data-testid="integration-center-connect"');
    expect(html).not.toContain('data-testid="provider-card-connect"');
    expect(html).not.toContain('data-testid="store-row-action"');
    expect(html).not.toContain('href=');
    expect(html).not.toContain('Otorisasi ulang');
    expect(html).not.toContain('+ Toko lain');
    expect(html).toContain('data-testid="integration-center-admin-only"');
    expect(html).toContain('Hanya Admin yang dapat menghubungkan');
    const { shopee, tiktok_shop, blibli } = cards(html);
    // Minta Admin on the reauth row only, not on the healthy store.
    expect(count(shopee ?? '', 'data-testid="ask-admin"')).toBe(1);
    expect(count(tiktok_shop ?? '', 'data-testid="ask-admin"')).toBe(1);
    expect(count(blibli ?? '', 'data-testid="ask-admin"')).toBe(1);
    expect(count(html, '>Minta Admin</button>')).toBe(3);
  });
});
