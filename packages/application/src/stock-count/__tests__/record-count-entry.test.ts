import { describe, expect, it } from 'vitest';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import { InMemoryCatalogStore } from '../../catalog/in-memory-catalog-store';
import {
  createProduct,
  createWarehouse,
} from '../../catalog/catalog-use-cases';
import { InMemoryStockCountStore } from '../in-memory-stock-count-store';
import { recordCountEntry } from '../record-count-entry';
import { startStockCount } from '../start-stock-count';

const WS = 'ws_record_count_entry_1';
const NOW = new Date('2026-10-16T10:00:00.000Z');

function ctxFor(
  role: WorkspaceContext['role'],
  warehouseScope: string | null = null
): WorkspaceContext {
  return {
    workspaceId: WS,
    userId: `user_${role}_1`,
    role,
    warehouseScope,
    status: 'active',
    authVersion: 1,
  };
}

/** JKT session over variants A (barcode, 7 on hand) and B; BDG unused. */
async function seed() {
  const catalog = new InMemoryCatalogStore();
  const ctx = ctxFor('admin');
  const jkt = await createWarehouse(catalog, {
    ctx,
    workspaceId: WS,
    code: 'JKT-ENTRY',
    name: 'Jakarta Entry',
  });
  const bdg = await createWarehouse(catalog, {
    ctx,
    workspaceId: WS,
    code: 'BDG-ENTRY',
    name: 'Bandung Entry',
  });
  const product = await createProduct(catalog, {
    ctx,
    workspaceId: WS,
    name: 'Kaos Entry',
    unit: 'pcs',
    variants: ['A', 'B'].map((v) => ({
      skuCode: `SKU-ENTRY-${v}`,
      name: v,
      barcode: v === 'A' ? '8990000000A' : null,
      sellingPriceCents: 10000,
      hppCents: 4000,
      costSource: 'manual' as const,
    })),
  });
  const [varA] = product.variants;
  await catalog.adjustLevel({
    workspaceId: WS,
    variantId: varA!.id,
    warehouseId: jkt.id,
    delta: 7,
    reason: 'adjustment',
    actorId: 'user_admin_1',
  });
  const store = new InMemoryStockCountStore(catalog);
  const audit = { append: async () => {} };
  const { session } = await startStockCount(
    { store, catalog, audit },
    {
      ctx,
      workspaceId: WS,
      warehouseId: jkt.id,
      name: 'Opname Entry',
      scopeType: 'all',
      now: NOW,
    }
  );
  const lines = await store.listLines(WS, session.id);
  const lineA = lines.find((l) => l.variantId === varA!.id)!;
  const base = {
    ctx: ctxFor('staff', jkt.id),
    workspaceId: WS,
    sessionId: session.id,
    now: NOW,
  };
  return { deps: { store }, store, session, lineA, base, bdgId: bdg.id };
}

describe('recordCountEntry (US12 / RFC 03 task 11)', () => {
  it('scans by barcode, merges add/replace and dedupes by clientEntryId', async () => {
    const { deps, store, lineA, base } = await seed();
    const first = await recordCountEntry(deps, {
      ...base,
      scanCode: ' 8990000000A ',
      qty: 3,
      mode: 'replace',
      clientEntryId: 'dev1:0001',
      deviceLabel: '  HP Gudang  ',
    });
    expect(first.deduplicated).toBe(false);
    expect(first.line).toMatchObject({
      id: lineA.id,
      countedQty: 3,
      systemQtyAtCount: 7,
      countedBy: 'user_staff_1',
    });
    expect(first.entry.deviceLabel).toBe('HP Gudang');
    const added = await recordCountEntry(deps, {
      ...base,
      lineId: lineA.id,
      qty: 2,
      mode: 'add',
      clientEntryId: 'dev1:0002',
    });
    expect(added.line.countedQty).toBe(5);
    const again = await recordCountEntry(deps, {
      ...base,
      lineId: lineA.id,
      qty: 2,
      mode: 'add',
      clientEntryId: 'dev1:0002',
    });
    expect(again.deduplicated).toBe(true);
    expect(again.line.countedQty).toBe(5);
    await expect(
      recordCountEntry(deps, {
        ...base,
        lineId: lineA.id,
        qty: 9,
        mode: 'add',
        clientEntryId: 'dev1:0002',
      })
    ).rejects.toMatchObject({ code: 'STOCK_COUNT_VERSION_CONFLICT' });
    expect(await store.listEntries(WS, lineA.id)).toHaveLength(2);
  });

  it('rejects bad input, unknown lines, out-of-scope users and non-counting sessions', async () => {
    const { deps, store, session, lineA, base, bdgId } = await seed();
    const entry = {
      ...base,
      lineId: lineA.id,
      qty: 1,
      mode: 'add' as const,
      clientEntryId: 'dev2:0001',
    };
    const bad = [
      { ...entry, scanCode: 'TIDAK-ADA' },
      { ...entry, qty: 1.5 },
      { ...entry, qty: 1_000_001 },
      { ...entry, clientEntryId: 'spasi tidak boleh' },
    ];
    for (const input of bad) {
      await expect(recordCountEntry(deps, input)).rejects.toMatchObject({
        code: 'STOCK_COUNT_VALIDATION',
      });
    }
    await expect(
      recordCountEntry(deps, { ...entry, scanCode: 'TIDAK-ADA' })
    ).rejects.toMatchObject({ message: 'SKU tidak termasuk sesi ini' });
    for (const input of [
      { ...entry, lineId: 'scl_missing' },
      { ...entry, ctx: ctxFor('staff', bdgId) },
      { ...entry, sessionId: 'scs_missing' },
    ]) {
      await expect(recordCountEntry(deps, input)).rejects.toMatchObject({
        code: 'STOCK_COUNT_NOT_FOUND',
      });
    }
    await store.updateSession({
      workspaceId: WS,
      sessionId: session.id,
      expectedVersion: session.version,
      expectedStatus: 'counting',
      changes: { status: 'cancelled' },
      closeLines: true,
      now: NOW,
    });
    await expect(recordCountEntry(deps, entry)).rejects.toMatchObject({
      code: 'STOCK_COUNT_VALIDATION',
    });
    expect(await store.listEntries(WS, lineA.id)).toHaveLength(0);
  });
});
