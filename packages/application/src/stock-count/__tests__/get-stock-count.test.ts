import { describe, expect, it } from 'vitest';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import { InMemoryCatalogStore } from '../../catalog/in-memory-catalog-store';
import {
  createProduct,
  createWarehouse,
  updateVariant,
} from '../../catalog/catalog-use-cases';
import { InMemoryStockCountStore } from '../in-memory-stock-count-store';
import { getStockCount } from '../get-stock-count';
import { recordCountEntry } from '../record-count-entry';
import { startStockCount } from '../start-stock-count';

const WS = 'ws_stock_count_get_1';
const NOW = new Date('2026-10-16T14:00:00.000Z');

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

/**
 * JKT A=10→count 4 (−6, HPP 4000), B=5→uncounted (HPP cleared to null),
 * plus a second warehouse BD for scope-filter checks.
 */
async function seed() {
  const catalog = new InMemoryCatalogStore();
  const admin = ctxFor('admin');
  const jkt = await createWarehouse(catalog, {
    ctx: admin,
    workspaceId: WS,
    code: 'JKT-GET',
    name: 'Jakarta Get',
  });
  const bdg = await createWarehouse(catalog, {
    ctx: admin,
    workspaceId: WS,
    code: 'BDG-GET',
    name: 'Bandung Get',
  });
  const { variants } = await createProduct(catalog, {
    ctx: admin,
    workspaceId: WS,
    name: 'Kaos Get',
    unit: 'pcs',
    variants: ['A', 'B'].map((v) => ({
      skuCode: `SKU-GET-${v}`,
      name: v,
      sellingPriceCents: 10000,
      hppCents: 4000,
      costSource: 'manual' as const,
    })),
  });
  for (const [i, qty] of [10, 5].entries()) {
    await catalog.adjustLevel({
      workspaceId: WS,
      variantId: variants[i]!.id,
      warehouseId: jkt.id,
      delta: qty,
      reason: 'initial stock',
      actorId: admin.userId,
    });
  }
  await updateVariant(catalog, {
    ctx: admin,
    workspaceId: WS,
    variantId: variants[1]!.id,
    hppCents: null,
    expectedVersion: variants[1]!.version,
  });
  const store = new InMemoryStockCountStore(catalog);
  const audit = {
    append: async (_e: {
      action: string;
      payload: Record<string, unknown>;
    }) => {},
  };
  const { session } = await startStockCount(
    { store, catalog, audit },
    {
      ctx: admin,
      workspaceId: WS,
      warehouseId: jkt.id,
      name: 'Opname Get',
      scopeType: 'all',
      now: NOW,
    }
  );
  const lines = await store.listLines(WS, session.id);
  const lineA = lines.find((l) => l.variantId === variants[0]!.id)!;
  await recordCountEntry(
    { store },
    {
      ctx: ctxFor('staff', jkt.id),
      workspaceId: WS,
      sessionId: session.id,
      lineId: lineA.id,
      qty: 4,
      mode: 'replace',
      clientEntryId: 'get:a',
      now: NOW,
    }
  );
  return {
    store,
    catalog,
    sessionId: session.id,
    jktId: jkt.id,
    bdgId: bdg.id,
    variantA: variants[0]!.id,
    variantB: variants[1]!.id,
  };
}

describe('getStockCount (US12 / RFC 03 task 18)', () => {
  it('Manager sees Rp at HPP (−6×4000) and null when SKU has no HPP', async () => {
    const { store, catalog, sessionId, jktId, variantA, variantB } =
      await seed();
    const detail = await getStockCount(
      { store, catalog },
      { ctx: ctxFor('manager', jktId), workspaceId: WS, sessionId }
    );
    expect(detail).toMatchObject({
      countedLines: 1,
      uncountedLines: 1,
      totalDelta: -6,
      totalValueCents: -24000,
    });
    const a = detail.lines.find((l) => l.line.variantId === variantA)!;
    expect(a).toMatchObject({
      liveQty: 10,
      variance: -6,
      movement: 0,
      hppCents: 4000,
      varianceValueCents: -24000,
    });
    expect(a.flags).toContain('large_negative');
    const b = detail.lines.find((l) => l.line.variantId === variantB)!;
    expect(b).toMatchObject({
      variance: null,
      hppCents: null,
      varianceValueCents: null,
    });
    expect(Object.prototype.hasOwnProperty.call(a, 'hppCents')).toBe(true);
  });

  it('Staff detail omits all Rp value keys', async () => {
    const { store, catalog, sessionId, jktId } = await seed();
    const detail = await getStockCount(
      { store, catalog },
      { ctx: ctxFor('staff', jktId), workspaceId: WS, sessionId }
    );
    expect(detail.totalDelta).toBe(-6);
    expect(
      Object.prototype.hasOwnProperty.call(detail, 'totalValueCents')
    ).toBe(false);
    for (const line of detail.lines) {
      expect(Object.prototype.hasOwnProperty.call(line, 'hppCents')).toBe(
        false
      );
      expect(
        Object.prototype.hasOwnProperty.call(line, 'varianceValueCents')
      ).toBe(false);
    }
  });

  it('out-of-scope Manager gets STOCK_COUNT_NOT_FOUND', async () => {
    const { store, catalog, sessionId, bdgId } = await seed();
    await expect(
      getStockCount(
        { store, catalog },
        { ctx: ctxFor('manager', bdgId), workspaceId: WS, sessionId }
      )
    ).rejects.toMatchObject({ code: 'STOCK_COUNT_NOT_FOUND' });
  });
});
