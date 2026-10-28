import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type {
  InventorySyncAttentionItem,
  InventorySyncStatus,
  MappingSyncStateView,
} from '@tokoboss/contracts';
import { InventorySyncAttentionBanner } from '../components/sku-mapping/InventorySyncAttentionBanner';
import { MappingSyncConfigPopover } from '../components/sku-mapping/MappingSyncConfigPopover';
import { SubordinateStoreSlot } from '../components/sku-mapping/SubordinateStoreSlot';
import { SyncPresetChips } from '../components/sku-mapping/SyncPresetChips';
import {
  patchMappingSyncSettings,
  postMappingSyncRetry,
} from '../lib/inventory-sync-client';
import { SLOT, VAR_A, WS } from './sku-mapping-panel-fixture';

/**
 * US04 / RFC 06 task 51: SubordinateStoreSlot sync badges (row 49), sync
 * popover chips → PATCH + Staff read-only (48), attention banner (47).
 * No DOM: static render, direct calls for handler wiring.
 */

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

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

const state = (
  syncStatus: InventorySyncStatus,
  extra: Partial<MappingSyncStateView> = {}
): MappingSyncStateView => ({
  mappingId: SLOT.mappingId,
  variantId: VAR_A,
  connectionId: SLOT.connectionId,
  syncEnabled: syncStatus !== 'off',
  stockBuffer: 2,
  allocationPct: 100,
  syncStatus,
  desiredQty: 10,
  lastPushedQty: 8,
  lastSyncedAt: '2026-10-28T09:55:00.000Z',
  lastErrorCode: null,
  lastErrorMessage: null,
  version: 1,
  ...extra,
});

const ATTN: InventorySyncAttentionItem = {
  mappingId: SLOT.mappingId,
  variantId: VAR_A,
  skuCode: 'KAOS-M',
  storeSkuText: 'SP-KAOS-M',
  platformSkuId: 'plat-50',
  channel: 'shopee',
  storeDisplayName: 'Toko sp',
  errorCode: 'MARKETPLACE_RATE_LIMITED',
  reason: 'Toko sedang membatasi permintaan.',
  remediation: 'retry_now',
  updatedAt: '2026-10-28T09:55:00.000Z',
};

const okFetch = () =>
  vi.fn(
    async () =>
      new Response(JSON.stringify({ state: null, synced: true }), {
        status: 200,
      })
  );

describe('inventory sync UI (RFC 06 task 51)', () => {
  it('renders Mati / Tersinkron / Menyinkronkan / Perlu tindakan on SubordinateStoreSlot', () => {
    const slot = (syncState?: MappingSyncStateView) =>
      html(
        <SubordinateStoreSlot
          mapping={SLOT}
          onUnmap={() => {}}
          syncState={syncState}
        />
      );
    expect(slot()).toMatch(/data-status="off".*Mati/);
    const cases: [InventorySyncStatus, string][] = [
      ['synced', 'Tersinkron'],
      ['syncing', 'Menyinkronkan'],
      ['needs_attention', 'Perlu tindakan'],
    ];
    for (const [status, label] of cases) {
      const out = slot(state(status));
      expect(out).toContain(label);
      expect(out).toContain('Diinginkan 10 · Terkirim 8');
    }
  });

  it('MappingSyncConfigPopover updates buffer/allocation via patchMappingSyncSettings; Staff is read-only', async () => {
    const fetchFn = okFetch();
    const onChange = vi.fn((patch: object) =>
      patchMappingSyncSettings(WS, SLOT.mappingId, patch, fetchFn)
    );
    const props = {
      state: state('synced'),
      availableQty: 20,
      onChange,
      onSync: vi.fn(),
    };
    const tree = MappingSyncConfigPopover(props);
    const [buffer, alloc] = findAll(tree, SyncPresetChips);
    (buffer!.props.onSelect as (n: number) => void)(5);
    (alloc!.props.onSelect as (n: number) => void)(80);
    expect(onChange.mock.calls).toEqual([
      [{ stockBuffer: 5 }],
      [{ allocationPct: 80 }],
    ]);
    await Promise.all(onChange.mock.results.map((r) => r.value));
    const calls = fetchFn.mock.calls as unknown as [string, RequestInit][];
    expect(calls).toHaveLength(2);
    expect(calls[0]![1].method).toBe('PATCH');
    expect(calls[0]![0]).toContain(`/sku-mappings/${SLOT.mappingId}/sync`);
    expect(JSON.parse(String(calls[1]![1].body))).toEqual({
      allocationPct: 80,
    });

    const staff = html(<MappingSyncConfigPopover {...props} canEdit={false} />);
    const controls = staff.match(/<(button|input)\b[^>]*>/g) ?? [];
    expect(controls.length).toBeGreaterThan(0);
    for (const c of controls) expect(c).toContain('disabled');
  });

  it('InventorySyncAttentionBanner shows SKU TokoBoss, Store SKU, store, reason and triggers Coba lagi', async () => {
    const fetchFn = okFetch();
    const onAction = vi.fn((item: InventorySyncAttentionItem) =>
      postMappingSyncRetry(WS, item.mappingId, fetchFn)
    );
    const out = html(
      <InventorySyncAttentionBanner items={[ATTN]} onAction={onAction} />
    );
    expect(out).toContain('SKU TokoBoss KAOS-M · Store SKU SP-KAOS-M');
    expect(out).toContain('Toko sp');
    expect(out).toContain('Toko sedang membatasi permintaan.');
    expect(out).toContain('Coba lagi');
    expect(
      html(<InventorySyncAttentionBanner items={[]} onAction={onAction} />)
    ).toBe('');
    const staff = html(
      <InventorySyncAttentionBanner
        items={[ATTN]}
        onAction={onAction}
        canEdit={false}
      />
    );
    expect(staff).not.toContain('Coba lagi');

    const tree = InventorySyncAttentionBanner({ items: [ATTN], onAction });
    const [btn] = findAll(tree, 'button');
    (btn!.props.onClick as () => void)();
    expect(onAction).toHaveBeenCalledWith(ATTN);
    await onAction.mock.results[0]!.value;
    const calls = fetchFn.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0]![1].method).toBe('POST');
    expect(calls[0]![0]).toContain(`/sku-mappings/${SLOT.mappingId}/sync`);
  });
});
