import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StagedListingCandidateView } from '@tokoboss/contracts';
import { DrawerStoreSkusSection } from '../components/catalog/DrawerStoreSkusSection';
import { AmbiguousMatchDialog } from '../components/sku-mapping/AmbiguousMatchDialog';
import { SkuMappingPanel } from '../components/sku-mapping/SkuMappingPanel';
import { SkuMappingSummaryGrid } from '../components/sku-mapping/SkuMappingSummaryGrid';
import { SkuMappingVariantCard } from '../components/sku-mapping/SkuMappingVariantCard';
import type { ChannelMappingView } from '../lib/catalog-client';
import type { SkuMappingReview } from '../lib/use-sku-mapping-review';
import type { SkuMappingsState } from '../lib/use-sku-mappings';
import {
  AMBIG,
  BULK,
  OVERVIEW,
  VAR_A,
  VAR_B,
  WS,
} from './sku-mapping-panel-fixture';

/**
 * US03 / RFC 05 task 50b: Petakan Store SKU UI. SkuMappingPanel (row 39)
 * renders SKU TokoBoss cards, subordinate Store SKU chips and KPI counts,
 * wires bulk-map and the ambiguous review dialog (row 37), and the SkuDrawer
 * DrawerStoreSkusSection (row 41) renders live or legacy rows. No DOM: the
 * data hooks are mocked, static render, direct calls for handler wiring.
 */

const fx = vi.hoisted(() => ({
  state: null as unknown,
  review: null as unknown,
  card: null as unknown,
}));

vi.mock('@/lib/use-sku-mappings', () => ({ useSkuMappings: () => fx.state }));
vi.mock('@/lib/use-sku-mapping-review', () => ({
  useSkuMappingReview: () => fx.review,
}));
vi.mock('@/lib/use-drawer-store-skus', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useDrawerStoreSkus: () => fx.card,
}));

// Components use the classic JSX runtime under vitest, so expose React.
(globalThis as unknown as { React: typeof React }).React = React;

type El = React.ReactElement<Record<string, unknown> & { children?: unknown }>;

/** Every element of `type` in a component's returned (unrendered) tree. */
function findAll(node: unknown, type: unknown, out: El[] = []): El[] {
  if (Array.isArray(node)) node.forEach((n) => findAll(n, type, out));
  else if (React.isValidElement<El['props']>(node)) {
    if (node.type === type) out.push(node);
    findAll(node.props.children, type, out);
  }
  return out;
}

const html = (type: unknown, props: object) =>
  renderToStaticMarkup(React.createElement(type as React.FC<object>, props));
const count = (out: string, id: string) =>
  out.split(`data-testid="${id}"`).length - 1;

const state = (): SkuMappingsState => ({
  overview: OVERVIEW,
  history: [],
  loading: false,
  failed: false,
  busy: null,
  error: null,
  map: vi.fn(async () => null),
  bulkMap: vi.fn(async () => 1),
  unmap: vi.fn(async () => true),
  clearError: vi.fn(),
  filters: {},
  setFilters: vi.fn(),
  bulkItems: BULK,
  retry: vi.fn(),
});

const review = (
  candidate: StagedListingCandidateView | null = null
): SkuMappingReview => ({
  candidate,
  options: OVERVIEW.items.map((i) => ({
    variantId: i.variantId,
    skuCode: i.skuCode,
    title: `${i.productName} · ${i.variantName}`,
  })),
  defaultVariantId: candidate ? VAR_A : undefined,
  error: null,
  open: vi.fn(),
  pick: vi.fn(),
  confirm: vi.fn(),
  cancel: vi.fn(),
});

const LEGACY: ChannelMappingView = {
  id: 'legacy-50',
  workspaceId: WS,
  variantId: VAR_A,
  channel: 'shopee',
  shopExtId: 'shop-legacy',
  platformSkuId: 'SKU-LAMA',
  sellerSkuHint: null,
  barcodeHint: null,
  listingName: 'Kaos lama',
  createdAt: '2026-10-01T00:00:00.000Z',
};

beforeEach(() => {
  fx.state = state();
  fx.review = review();
  fx.card = null;
});

describe('Petakan Store SKU UI (task 50)', () => {
  it('panel: SKU TokoBoss cards, Store SKU chips, KPI counts', () => {
    const out = html(SkuMappingPanel, { workspaceId: WS });
    expect(out).toContain('SKU TokoBoss adalah sumber utama');
    expect(count(out, 'sku-mapping-card')).toBe(2);
    expect(out).toContain('SKU TokoBoss · KAOS-M');
    expect(out).toContain('SKU TokoBoss · KAOS-L');
    expect(out).toMatch(/data-kpi="mapped".*?>7</);
    expect(out).toMatch(/data-kpi="review".*?>3</);
    expect(out).toMatch(/data-kpi="unmapped".*?>5</);
    expect(count(out, 'sku-mapping-slot')).toBe(1);
    expect(out).toContain('Shopee · Toko sp · Store SKU SP-KAOS-M');
    expect(out).toContain('Konflik stok: Toko 10 vs TokoBoss 12');
    expect(count(out, 'sku-mapping-store-picker')).toBe(3);
    expect(count(out, 'sku-mapping-review')).toBe(2);
    expect(out).not.toContain('ambiguous-match-dialog');
    const staff = html(SkuMappingPanel, { workspaceId: WS, canEdit: false });
    for (const id of ['bulk-map', 'unmap', 'review'])
      expect(count(staff, `sku-mapping-${id}`)).toBe(0);
  });

  it('panel: bulk-map CTA and the ambiguous review dialog', () => {
    const s = fx.state as SkuMappingsState;
    expect(html(SkuMappingPanel, { workspaceId: WS })).toContain(
      'Petakan otomatis (1 saran cocok)'
    );
    const tree = SkuMappingPanel({ workspaceId: WS });
    const [grid] = findAll(tree, SkuMappingSummaryGrid);
    (grid?.props.onBulkMap as () => void)();
    expect(s.bulkMap).toHaveBeenCalledWith(BULK);
    const cards = findAll(tree, SkuMappingVariantCard);
    expect(cards.map((c) => c.key)).toEqual([VAR_A, VAR_B]);
    const r = fx.review as SkuMappingReview;
    expect(cards[1]?.props.onReview).toBe(r.open);
    fx.review = review(AMBIG);
    const [dialog] = findAll(
      SkuMappingPanel({ workspaceId: WS }),
      AmbiguousMatchDialog
    );
    expect(dialog?.key).toBe(AMBIG.listingId);
    expect(dialog?.props.onConfirm).toBe(
      (fx.review as SkuMappingReview).confirm
    );
    const out = html(SkuMappingPanel, { workspaceId: WS });
    expect(count(out, 'ambiguous-match-dialog')).toBe(1);
    expect(out).toContain('Tinjau kecocokan ambigu');
    expect(out).toContain('Store SKU ini cocok dengan 2 SKU TokoBoss');
  });

  it('drawer: live Store SKU rows, legacy fallback, empty state', () => {
    const props = { workspaceId: WS, variantId: VAR_A, mappings: [LEGACY] };
    const href = `/w/${WS}/produk/pemetaan?variantId=${VAR_A}`;
    const legacy = html(DrawerStoreSkusSection, props);
    expect(legacy).toContain('Dijual di');
    expect(legacy).toContain('Shopee · shop-legacy · Store SKU SKU-LAMA');
    expect(legacy).toContain(`href="${href}"`);
    fx.card = OVERVIEW.items[0];
    const live = html(DrawerStoreSkusSection, props);
    expect(live).not.toContain('SKU-LAMA');
    expect(count(live, 'drawer-mapping-conflict')).toBe(1);
    expect(live).toContain('TikTok Shop · Toko tt · Store SKU TT-KAOS');
    expect(count(live, 'drawer-mapping-suggestion')).toBe(1);
    fx.card = null;
    const empty = html(DrawerStoreSkusSection, { ...props, mappings: [] });
    expect(empty).toContain('Belum ada Store SKU.');
  });
});
