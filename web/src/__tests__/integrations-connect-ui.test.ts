import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MarketplaceProviderWire } from '@tokoboss/contracts';
import { ConnectProblem } from '../components/integrations/ConnectProblem';
import { ConnectProviderStep } from '../components/integrations/ConnectProviderStep';
import { ConsentStep } from '../components/integrations/ConsentStep';
import { resolveIntegrationProblem } from '../lib/integration-problem-views';

/**
 * US20 / RFC 04 task 127a (CoS split of row 127): connect wizard steps 1–2
 * (ConnectProviderStep 110b, ConsentStep 111; mockup v2 screen 2) and the
 * cancelled-at-provider card (ConnectProblem 116c, screen 4) saying the
 * store is not connected. Static render plus direct calls of the step
 * components' button handlers (both are stateless). Blibli key form and
 * wizard orchestration tests wait for rows 112 / 113 (127b).
 */

// Components use the classic JSX runtime under vitest, so expose React.
(globalThis as unknown as { React: typeof React }).React = React;

type Props = {
  'data-testid'?: string;
  children?: unknown;
  onClick?: () => void;
};

/** Finds the element with `data-testid` in a stateless component's tree. */
function byTestId(node: unknown, id: string): React.ReactElement<Props> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = byTestId(child, id);
      if (hit) return hit;
    }
    return null;
  }
  if (!React.isValidElement<Props>(node)) return null;
  if (node.props['data-testid'] === id) return node;
  return byTestId(node.props.children, id);
}

function providerStep(selected: MarketplaceProviderWire | null) {
  const handlers = { onSelect: vi.fn(), onNext: vi.fn(), onCancel: vi.fn() };
  const props = { selected, ...handlers };
  const html = renderToStaticMarkup(
    React.createElement(ConnectProviderStep, props)
  );
  return { html, tree: ConnectProviderStep(props), ...handlers };
}

describe('integration connect UI (task 127a)', () => {
  it('step 1 lists the three providers and gates Lanjut on a pick', () => {
    const none = providerStep(null);
    expect(none.html).toContain('Pilih marketplace');
    expect(
      [...none.html.matchAll(/data-provider="([a-z_]+)"/g)].map((m) => m[1])
    ).toEqual(['shopee', 'tiktok_shop', 'blibli']);
    expect(none.html).toContain('Masuk dengan akun penjual Shopee');
    expect(none.html).toContain('Masuk dengan akun penjual TikTok Shop');
    expect(none.html).toContain('Masuk dengan akun Seller Blibli');
    expect(none.html).not.toContain('aria-pressed="true"');
    expect(none.html).toMatch(
      /data-testid="connect-provider-next"[^>]*disabled=""/
    );
    expect(none.html).toContain('>Lanjut</button>');
    expect(none.html).toContain('>Batal</button>');

    const picked = providerStep('blibli');
    expect(count(picked.html, 'aria-pressed="true"')).toBe(1);
    expect(picked.html).toContain('data-provider="blibli" aria-pressed="true"');
    expect(picked.html).not.toMatch(
      /data-testid="connect-provider-next"[^>]*disabled=""/
    );
    byTestId(picked.tree, 'connect-provider-next')?.props.onClick?.();
    byTestId(picked.tree, 'connect-provider-cancel')?.props.onClick?.();
    expect(picked.onNext).toHaveBeenCalledTimes(1);
    expect(picked.onCancel).toHaveBeenCalledTimes(1);
    expect(picked.onSelect).not.toHaveBeenCalled();
  });

  it('step 2 shows the consent scopes, sync off, Lanjut ke / Kembali', () => {
    const onNext = vi.fn();
    const onBack = vi.fn();
    const props = { provider: 'tiktok_shop' as const, onNext, onBack };
    const html = renderToStaticMarkup(React.createElement(ConsentStep, props));
    expect(html).toContain(
      'TokoBoss akan meminta izin berikut dari TikTok Shop.'
    );
    const read = html.split('data-testid="consent-read-scopes"')[1] ?? '';
    expect(count(read.split('</ul>')[0] ?? '', '<li>')).toBe(3);
    expect(html).toContain('Data yang dibaca');
    expect(html).toContain('Pesanan (untuk impor order)');
    expect(html).toContain('Data yang diperbarui');
    expect(html).toContain('hanya setelah pemetaan &amp; sinkron diaktifkan');
    expect(html).toContain('data-testid="consent-own-stores-note"');
    expect(html).toContain('>Lanjut ke TikTok Shop</button>');
    expect(html).toContain('>Kembali</button>');
    expect(html).not.toMatch(/data-testid="consent-next"[^>]*disabled=""/);
    const busy = renderToStaticMarkup(
      React.createElement(ConsentStep, { ...props, busy: true })
    );
    expect(busy).toMatch(/data-testid="consent-next"[^>]*disabled=""/);
    expect(busy).toContain('aria-busy="true"');
    const tree = ConsentStep(props);
    byTestId(tree, 'consent-back')?.props.onClick?.();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
  });

  it('cancel at the provider says the store is not connected', () => {
    const problem = resolveIntegrationProblem({ result: 'cancelled' });
    expect(problem).toEqual({ variant: 'cancelled', missingPermissions: [] });
    const render = (isAdmin: boolean) =>
      renderToStaticMarkup(
        React.createElement(ConnectProblem, {
          problem: problem!,
          provider: 'Shopee',
          isAdmin,
          onAction: () => undefined,
          centerHref: '/w/ws-1/integrasi',
        })
      );
    const admin = render(true);
    expect(admin).toContain('data-variant="cancelled"');
    expect(admin).toContain('Dibatalkan pengguna');
    expect(admin).toContain(
      'Anda membatalkan otorisasi di halaman Shopee. Toko belum terhubung.'
    );
    expect(admin).not.toContain('Terhubung</span>');
    expect(admin).not.toContain('Toko ini sudah terhubung');
    expect(admin).toContain('data-action="retry"');
    expect(admin).toContain('>Coba lagi</button>');
    const staff = render(false);
    expect(staff).toContain('Toko belum terhubung.');
    expect(staff).not.toContain('Coba lagi');
    expect(staff).toContain('data-testid="ask-admin"');
  });
});

const count = (html: string, needle: string) => html.split(needle).length - 1;
