import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectProblem } from '../components/integrations/ConnectProblem';
import { DisconnectedPanel } from '../components/integrations/DisconnectedPanel';
import { RemoveConnectionDialog } from '../components/integrations/RemoveConnectionDialog';
import { resolveIntegrationProblem } from '../lib/integration-problem-views';

/**
 * US20 / RFC 04 task 128: store detail UI — the blocked-elsewhere card is
 * neutral (ConnectProblem 116c + ConnectBlockedDetails 116a, mockup v2
 * screen 4), the Disconnected panel's impact table and actions
 * (DisconnectedPanel 117c + DisconnectedImpact 117b, screen 5) and the
 * Hapus koneksi confirm dialog (RemoveConnectionDialog 119b). No DOM here:
 * static render, direct calls of stateless trees for handlers, and React's
 * useEffect captured via vi.mock('react') to drive the dialog's Escape key.
 */

const fx = vi.hoisted(() => ({ effects: [] as (() => unknown)[] }));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const useEffect = (effect: () => unknown) => {
    fx.effects.push(effect);
  };
  return { ...actual, useEffect };
});

// Components use the classic JSX runtime under vitest, so expose React.
(globalThis as unknown as { React: typeof React }).React = React;

type El = React.ReactElement<{ children?: unknown; onClick?: () => void }>;

/** Every element of `type` in a stateless component's returned tree. */
function findAll(node: unknown, type: string, out: El[] = []): El[] {
  if (Array.isArray(node)) node.forEach((n) => findAll(n, type, out));
  else if (React.isValidElement<El['props']>(node)) {
    if (node.type === type) out.push(node);
    findAll(node.props.children, type, out);
  }
  return out;
}

const html = (type: unknown, props: object) =>
  renderToStaticMarkup(React.createElement(type as React.FC<object>, props));

beforeEach(() => {
  fx.effects.length = 0;
  vi.unstubAllGlobals();
});

describe('integration store detail UI (task 128)', () => {
  it('blocked elsewhere: neutral copy, no owner hint, no action', () => {
    const audit = {
      actor: 'Rina',
      role: 'Admin',
      provider: 'Shopee',
      storeId: '7495…0213',
      time: '26 Okt 2026 10:05 WIB',
    };
    const base = {
      problem: resolveIntegrationProblem({ result: 'blocked' }),
      provider: 'Shopee',
      storeName: 'Toko Sinar Jaya',
      storeId: '749512340213',
      centerHref: '/w/ws-1/integrasi',
    };
    const admin = { ...base, isAdmin: true, onAction: vi.fn(), audit };
    const out = html(ConnectProblem, admin);
    expect(out).toContain('data-variant="blocked"');
    expect(out).toContain('>Toko sudah terhubung ke workspace lain</h3>');
    expect(out).toContain('>Diblokir</span>');
    expect(out).toContain(
      '<b>Toko ini sudah terhubung ke workspace TokoBoss lain</b>'
    );
    expect(out).toContain('Tidak ada data yang diimpor.');
    expect(out).toContain('Minta Admin workspace pemilik untuk memutus toko');
    expect(out).toContain('<li>Atau hubungi support.</li>');
    expect(out).toContain('tetap di workspace lama dan tidak ikut pindah');
    expect(out).toContain(
      'Rina (Admin) mencoba menghubungkan Shopee · ID toko 7495…0213 — diblokir: sudah terhubung ke workspace lain · 26 Okt 2026 10:05 WIB'
    );
    expect(out).toContain(
      'href="/w/ws-1/integrasi">Kembali ke Pusat integrasi'
    );
    expect(out).not.toMatch(/Toko Sinar Jaya|749512340213/);
    expect(out).not.toMatch(/connect-problem-action|ask-admin/);
    expect(html(ConnectProblem, { ...base, isAdmin: false, audit })).toBe(out);
    const en = html(ConnectProblem, {
      ...base,
      isAdmin: false,
      lang: 'en',
      supportHref: 'mailto:support@tokoboss.id',
    });
    expect(en).toContain('already connected to another TokoBoss');
    expect(en).toContain('href="mailto:support@tokoboss.id"');
    expect(en).not.toMatch(/connect-blocked-audit|Toko Sinar Jaya/);
  });

  it('disconnected: source line, impact table, Admin vs Staff actions', () => {
    const connection = {
      provider: 'shopee' as const,
      providerStoreId: '749512340213',
      storeName: 'Toko Sinar Jaya',
      disconnectSource: 'seller' as const,
      disconnectedAt: '2026-10-26T03:05:00.000Z',
    };
    const props = {
      connection,
      isAdmin: true,
      mappingCount: 128,
      reconnectHref: '/w/ws-1/integrasi/hubungkan',
      onRemove: vi.fn(),
    };
    const out = html(DisconnectedPanel, props);
    expect(out).toContain('Toko Sinar Jaya · Shopee');
    expect(out).toContain('data-status="disconnected"');
    expect(out).toContain(
      'Diputus dari sisi penjual (di aplikasi penyedia) · terdeteksi 26 Okt 2026 10:05 WIB.'
    );
    const rows = [
      ...out.matchAll(
        /data-kept="(\w+)".*?<td[^>]*>([^<]+)<.*?<span[^>]*>([^<]+)</g
      ),
    ].map((m) => [m[1], m[2], m[3]]);
    expect(rows).toEqual([
      ['false', 'Sinkron stok ke toko ini', 'Dijeda'],
      ['false', 'Impor order baru', 'Dijeda'],
      ['true', 'Pemetaan Store SKU (128)', 'Tetap tersimpan'],
      ['true', 'Riwayat order &amp; ledger', 'Tetap tersimpan'],
    ]);
    expect(out).toContain(
      'Penyebab lain: toko dinonaktifkan oleh penyedia, atau Admin memutus dari TokoBoss. Saat dihubungkan lagi ke toko yang sama, pemetaan langsung dipakai kembali tanpa memetakan ulang.'
    );
    expect(out).toContain('href="/w/ws-1/integrasi/hubungkan"');
    expect(out).toContain('>Hapus koneksi (pemetaan diarsipkan)</button>');
    expect(out).not.toContain('data-testid="ask-admin"');
    const [remove] = findAll(DisconnectedPanel(props), 'button');
    remove?.props.onClick?.();
    expect(props.onRemove).toHaveBeenCalledTimes(1);

    const nil = { ...connection, disconnectSource: null, disconnectedAt: null };
    const staff = html(DisconnectedPanel, { connection: nil, isAdmin: false });
    expect(staff).toContain('>Koneksi terputus.</p>');
    expect(staff).toContain('>Pemetaan Store SKU</td>');
    expect(staff).not.toMatch(/Penyebab lain|Hubungkan lagi|Hapus koneksi/);
    expect(staff).toContain('>Minta Admin</button>');
  });

  it('Hapus koneksi dialog: archive copy, busy/failed, confirm and cancel', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const store = 'Toko Sinar Jaya · Shopee';
    const props = { open: true, store, onConfirm, onCancel };
    expect(html(RemoveConnectionDialog, { ...props, open: false })).toBe('');
    const out = html(RemoveConnectionDialog, props);
    expect(out).toContain('role="dialog" aria-modal="true"');
    expect(out).toContain('>Hapus koneksi Toko Sinar Jaya · Shopee?</h2>');
    expect(out).toContain('toko tampil sebagai Belum terhubung');
    expect(out).toContain('Pemetaan Store SKU toko ini diarsipkan');
    expect(out).toContain('Kepemilikan toko dilepas');
    expect(out).toContain('Riwayat order &amp; ledger tetap tersimpan');
    expect(out).toContain('>Hapus koneksi</button>');
    expect(out).toContain('>Batal</button>');
    expect(out).not.toMatch(/role="alert"|disabled=""/);
    const failed = html(RemoveConnectionDialog, { ...props, failed: true });
    expect(failed).toMatch(/role="alert"[^>]*>Gagal menghapus koneksi\. Coba/);
    const busy = html(RemoveConnectionDialog, { ...props, busy: true });
    expect(busy).toContain('>Menghapus...</button>');
    expect(busy.match(/disabled=""/g)).toHaveLength(2);

    fx.effects.length = 0;
    const tree = RemoveConnectionDialog(props) as El;
    const [confirm, cancel] = findAll(tree, 'button');
    confirm?.props.onClick?.();
    cancel?.props.onClick?.();
    tree.props.onClick?.();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(2);
    const keys = new Map<string, (e: { key: string }) => void>();
    const on = vi.fn(keys.set.bind(keys));
    const off = vi.fn();
    vi.stubGlobal('window', { addEventListener: on, removeEventListener: off });
    const cleanup = fx.effects[0]?.() as () => void;
    keys.get('keydown')?.({ key: 'Enter' });
    keys.get('keydown')?.({ key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(3);
    cleanup();
    expect(off).toHaveBeenCalledWith('keydown', keys.get('keydown'));

    fx.effects.length = 0;
    const locked = RemoveConnectionDialog({ ...props, busy: true }) as El;
    expect(locked.props.onClick).toBeUndefined();
    fx.effects[0]?.();
    keys.get('keydown')?.({ key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(3);
  });
});
