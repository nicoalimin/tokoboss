import { describe, expect, it } from 'vitest';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import { InMemoryCatalogStore } from '../../catalog/in-memory-catalog-store';
import {
  adjustStock,
  createProduct,
  createWarehouse,
} from '../../catalog/catalog-use-cases';
import { InMemoryStockCountStore } from '../in-memory-stock-count-store';

const WS = 'ws_stock_count_store_1';
const NOW = new Date('2026-10-15T09:00:00.000Z');

function admin(): WorkspaceContext {
  return {
    workspaceId: WS,
    userId: 'user_admin_1',
    role: 'admin',
    warehouseScope: null,
    status: 'active',
    authVersion: 1,
  };
}

/** Two active variants in one warehouse: A has 10 units, B has 3. */
async function seed() {
  const catalog = new InMemoryCatalogStore();
  const ctx = admin();
  const warehouse = await createWarehouse(catalog, {
    ctx,
    workspaceId: WS,
    code: 'JKT-OPN',
    name: 'Jakarta Opname',
  });
  const product = await createProduct(catalog, {
    ctx,
    workspaceId: WS,
    name: 'Kaos Opname',
    unit: 'pcs',
    variants: ['A', 'B'].map((v) => ({
      skuCode: `SKU-OPN-${v}`,
      name: v,
      sellingPriceCents: 10000,
      hppCents: 4000,
      costSource: 'manual' as const,
    })),
  });
  const [a, b] = product.variants;
  for (const [variant, qty] of [
    [a!, 10],
    [b!, 3],
  ] as const) {
    await adjustStock(catalog, {
      ctx,
      workspaceId: WS,
      variantId: variant.id,
      warehouseId: warehouse.id,
      delta: qty,
      reason: 'seed opname',
    });
  }
  const store = new InMemoryStockCountStore(catalog);
  const { session, lineCount } = await store.createSession({
    workspaceId: WS,
    warehouseId: warehouse.id,
    name: 'Opname Oktober',
    scopeType: 'all',
    variantIds: null,
    freezeOutboundTransfers: false,
    actorId: 'user_admin_1',
    now: NOW,
  });
  return {
    catalog,
    store,
    warehouseId: warehouse.id,
    a: a!,
    session,
    lineCount,
  };
}

describe('InMemoryStockCountStore (US12 / RFC 03 task 8e)', () => {
  it('createSession snapshots every eligible variant and rejects an overlapping session', async () => {
    const { store, warehouseId, a, session, lineCount } = await seed();
    expect(lineCount).toBe(2);
    expect(session.code).toBe('OPN-2026-0001');
    expect(session.status).toBe('counting');
    const lines = await store.listLines(WS, session.id);
    const lineA = lines.find((l) => l.variantId === a.id);
    expect(lineA?.snapshotQty).toBe(10);
    expect(lineA?.countedQty).toBeNull();
    await expect(
      store.createSession({
        workspaceId: WS,
        warehouseId,
        name: 'Overlap',
        scopeType: 'skus',
        variantIds: [a.id],
        freezeOutboundTransfers: false,
        actorId: 'user_admin_1',
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'STOCK_COUNT_OVERLAP' });
  });

  it('recordEntry merges add then replace and dedupes a repeated clientEntryId', async () => {
    const { store, a, session } = await seed();
    const lines = await store.listLines(WS, session.id);
    const lineA = lines.find((l) => l.variantId === a.id)!;
    const entry = (qty: number, mode: 'add' | 'replace', id: string) =>
      store.recordEntry({
        workspaceId: WS,
        lineId: lineA.id,
        qty,
        mode,
        clientEntryId: id,
        deviceLabel: null,
        actorId: 'user_staff_1',
        now: NOW,
      });
    expect((await entry(4, 'add', 'c1')).line.countedQty).toBe(4);
    expect((await entry(3, 'add', 'c2')).line.countedQty).toBe(7);
    const replaced = await entry(8, 'replace', 'c3');
    expect(replaced.line.countedQty).toBe(8);
    expect(replaced.line.systemQtyAtCount).toBe(10);
    const replay = await entry(4, 'add', 'c1');
    expect(replay.deduplicated).toBe(true);
    expect((await store.listEntries(WS, lineA.id)).length).toBe(3);
  });

  it('postSession applies the variance to the catalog level, closes lines and replays by key', async () => {
    const { catalog, store, warehouseId, a, session } = await seed();
    const lines = await store.listLines(WS, session.id);
    const lineA = lines.find((l) => l.variantId === a.id)!;
    await store.recordEntry({
      workspaceId: WS,
      lineId: lineA.id,
      qty: 8,
      mode: 'replace',
      clientEntryId: 'p1',
      deviceLabel: null,
      actorId: 'user_staff_1',
      now: NOW,
    });
    const submitted = await store.updateSession({
      workspaceId: WS,
      sessionId: session.id,
      expectedVersion: session.version,
      expectedStatus: 'counting',
      changes: {
        status: 'submitted',
        submittedBy: 'user_staff_1',
        submittedAt: NOW,
      },
      now: NOW,
    });
    const post = {
      workspaceId: WS,
      sessionId: session.id,
      expectedVersion: submitted.version,
      actorId: 'user_admin_1',
      selfApproved: false,
      idempotencyKey: 'post-1',
      now: NOW,
    };
    const result = await store.postSession(post);
    expect(result.postedLines).toBe(1);
    expect(result.session.status).toBe('posted');
    expect((await catalog.getLevel(WS, a.id, warehouseId))?.qty).toBe(8);
    const after = await store.listLines(WS, session.id);
    expect(after.every((l) => !l.isOpen)).toBe(true);
    expect((await store.postSession(post)).deduplicated).toBe(true);
    expect((await catalog.getLevel(WS, a.id, warehouseId))?.qty).toBe(8);
  });
});
