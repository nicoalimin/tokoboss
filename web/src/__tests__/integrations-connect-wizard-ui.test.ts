import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IntegrationConnectionView } from '@tokoboss/contracts';
import { ConnectWizard } from '../components/integrations/ConnectWizard';
import {
  connectBlibliStore,
  startIntegrationConnection,
} from '../lib/integrations-actions-client';
import { IntegrationClientError } from '../lib/integrations-client';
import { useConnectWizard as runWizardHook } from '../lib/use-connect-wizard';

/**
 * US20 / RFC 04 task 127b (CoS split of row 127): connect wizard
 * orchestration (useConnectWizard 113d1 + ConnectWizard 113e, mockup v2
 * screen 2 steps 3–4) and the Blibli key form step (BlibliKeyForm 112c).
 * There is no DOM here, so React's useState is swapped for a slot store
 * that keeps state between re-runs of the hook; the route client is mocked
 * and `navigate` is the wizard's test seam (no real redirect).
 */

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], next: 0 }));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const useState = (init: unknown) => {
    const i = hooks.next++;
    if (!(i in hooks.slots)) hooks.slots[i] = init;
    const set = (value: unknown) => {
      hooks.slots[i] = value;
    };
    return [hooks.slots[i], set];
  };
  return { ...actual, useState };
});

vi.mock('../lib/integrations-actions-client', () => ({
  startIntegrationConnection: vi.fn(),
  connectBlibliStore: vi.fn(),
}));

// Components use the classic JSX runtime under vitest, so expose React.
(globalThis as unknown as { React: typeof React }).React = React;

const start = vi.mocked(startIntegrationConnection);
const connect = vi.mocked(connectBlibliStore);
const navigate = vi.fn();
const keys = {
  merchantCode: 'SIJ-60021',
  apiSellerKey: 'ask-secret-1',
  signatureKey: 'sig-secret-1',
};
const blibliMode = {
  mode: 'credential_binding' as const,
  provider: 'blibli' as const,
  connectionId: null,
};

/** Re-runs the hook against the slot store (one "render", no React). */
function run() {
  hooks.next = 0;
  return runWizardHook('ws-1', navigate);
}

function render(clientId: string | null = 'cid-1') {
  hooks.next = 0;
  const props = { workspaceId: 'ws-1', clientId, navigate };
  return renderToStaticMarkup(React.createElement(ConnectWizard, props));
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  hooks.slots.length = 0;
  vi.clearAllMocks();
});

describe('integration connect wizard UI (task 127b)', () => {
  it('Blibli: key form at step 3, submit opens the store as connected', async () => {
    start.mockResolvedValue(blibliMode);
    connect.mockResolvedValue({ id: 'conn-9' } as IntegrationConnectionView);
    run().select('blibli');
    run().next();
    expect(render()).toContain('data-step="2" aria-current="step"');
    run().start();
    expect(run().busy).toBe(true);
    await flush();
    expect(start).toHaveBeenCalledWith('ws-1', 'blibli');
    expect(run()).toMatchObject({ step: 3, keyForm: true, busy: false });
    const html = render();
    expect(html).toContain('data-step="3" aria-current="step"');
    expect(html).toContain('data-testid="blibli-key-form"');
    expect(html).toContain('data-testid="blibli-client-id"');
    expect(html).toContain('>cid-1</code>');
    expect(html).toContain('type="text" data-testid="blibli-merchantCode"');
    expect(html).toContain('type="password" data-testid="blibli-apiSellerKey"');
    expect(html).toContain('type="password" data-testid="blibli-signatureKey"');
    expect(html).toContain('>Hubungkan Blibli</button>');
    expect(html).toContain('data-testid="connect-wizard-back"');
    expect(html).toContain('>Batal</button>');
    expect(html).not.toContain('data-testid="connect-wizard-note"');
    expect(render(null)).toContain(
      'API client ID Blibli belum tersedia. Hubungi dukungan TokoBoss.'
    );

    run().submitKeys(keys);
    expect(connect).toHaveBeenCalledWith('ws-1', keys);
    await flush();
    expect(run().step).toBe(4);
    expect(navigate).toHaveBeenCalledWith(
      '/w/ws-1/integrasi/conn-9?result=connected'
    );
    const done = render();
    expect(done).toContain('data-step="4" aria-current="step"');
    expect(done).toContain('Kembali ke TokoBoss… memverifikasi toko dan izin');
    expect(done).not.toContain('blibli-key-form');
    expect(done).not.toContain('ask-secret-1');
  });

  it('OAuth: redirect note + authorize URL; route errors stay on step 2', async () => {
    start.mockRejectedValueOnce(
      new IntegrationClientError(409, 'ALREADY_CONNECTED', 'Toko sudah ada.')
    );
    run().select('shopee');
    run().next();
    run().start();
    await flush();
    expect(run()).toMatchObject({ step: 2, busy: false });
    expect(render()).toContain(
      'data-testid="connect-wizard-error" class="text-sm text-error-700">Toko sudah ada.</p>'
    );
    start.mockRejectedValueOnce(new Error('socket hang up'));
    run().start();
    await flush();
    expect(run().error).toBe('Terjadi kesalahan. Coba lagi.');
    expect(navigate).not.toHaveBeenCalled();

    const authorizeUrl = 'https://partner.shopeemobile.com/auth?state=s1';
    start.mockResolvedValueOnce({
      mode: 'oauth_redirect',
      provider: 'shopee',
      connectionId: null,
      authorizeUrl,
      expiresAt: '2026-10-27T00:10:00.000Z',
    });
    run().start();
    await flush();
    expect(navigate).toHaveBeenCalledWith(authorizeUrl);
    expect(run()).toMatchObject({ step: 3, keyForm: false, error: null });
    const html = render();
    expect(html).toContain('data-step="3" aria-current="step"');
    expect(html).toContain('Anda dialihkan ke halaman otorisasi Shopee…');
    expect(html).not.toContain('blibli-key-form');
    expect(html).not.toContain('connect-wizard-error');
    expect(connect).not.toHaveBeenCalled();
  });

  it('Kembali steps back; Batal returns to Integrasi with no connection', async () => {
    start.mockResolvedValue(blibliMode);
    run().next();
    expect(run().step).toBe(1);
    run().select('blibli');
    run().next();
    run().start();
    await flush();
    run().select('shopee');
    expect(run()).toMatchObject({ step: 3, provider: 'blibli', keyForm: true });
    run().back();
    expect(run()).toMatchObject({ step: 2, keyForm: false });
    run().submitKeys(keys);
    run().back();
    expect(run().step).toBe(1);
    run().cancel();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/w/ws-1/integrasi');
    expect(connect).not.toHaveBeenCalled();

    connect.mockReturnValue(new Promise(() => undefined));
    run().next();
    run().start();
    await flush();
    run().submitKeys(keys);
    run().cancel();
    run().back();
    expect(run()).toMatchObject({ step: 3, keyForm: true, busy: true });
    expect(navigate).toHaveBeenCalledTimes(1);
    const html = render();
    expect(html).toMatch(/data-testid="connect-wizard-back"[^>]*disabled=""/);
    expect(html).toMatch(/data-testid="connect-wizard-cancel"[^>]*disabled=""/);
    expect(html).toContain('>Memeriksa kunci…</button>');
  });
});
