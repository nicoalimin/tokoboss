import { describe, expect, it } from 'vitest';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import { InMemoryCatalogStore } from '../../catalog/in-memory-catalog-store';
import {
  createProduct,
  createWarehouse,
} from '../../catalog/catalog-use-cases';
import { InMemoryStockCountStore } from '../in-memory-stock-count-store';
import { startStockCount } from '../start-stock-count';
import { MAX_SESSION_LINES } from '../stock-count-rules';

const WS = 'ws_start_stock_count_1';
const NOW = new Date('2026-10-16T09:00:00.000Z');

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

/** Two warehouses; `withSkus` adds one product with variants A and B. */
async function seed(withSkus = true) {
  const catalog = new InMemoryCatalogStore();
  const ctx = ctxFor('admin');
  const jkt = await createWarehouse(catalog, {
    ctx,
    workspaceId: WS,
    code: 'JKT-START',
    name: 'Jakarta Start',
  });
  const bdg = await createWarehouse(catalog, {
    ctx,
    workspaceId: WS,
    code: 'BDG-START',
    name: 'Bandung Start',
  });
  const variantIds: string[] = [];
  if (withSkus) {
    const product = await createProduct(catalog, {
      ctx,
      workspaceId: WS,
      name: 'Kaos Start',
      unit: 'pcs',
      variants: ['A', 'B'].map((v) => ({
        skuCode: `SKU-START-${v}`,
        name: v,
        sellingPriceCents: 10000,
        hppCents: 4000,
        costSource: 'manual' as const,
      })),
    });
    variantIds.push(...product.variants.map((v) => v.id));
  }
  const store = new InMemoryStockCountStore(catalog);
  const events: { action: string; payload: Record<string, unknown> }[] = [];
  const deps = {
    store,
    catalog,
    audit: {
      append: async (e: {
        action: string;
        payload: Record<string, unknown>;
      }) => {
        events.push(e);
      },
    },
  };
  return { deps, store, events, jktId: jkt.id, bdgId: bdg.id, variantIds };
}

describe('startStockCount (US12 / RFC 03 task 10)', () => {
  it('starts a session, emits stock_count.started and rejects an overlapping session', async () => {
    const { deps, events, jktId, variantIds } = await seed();
    const { session, lineCount } = await startStockCount(deps, {
      ctx: ctxFor('manager'),
      workspaceId: WS,
      warehouseId: jktId,
      name: '  Opname Oktober  ',
      scopeType: 'all',
      freezeOutboundTransfers: true,
      now: NOW,
    });
    expect(lineCount).toBe(2);
    expect(session.name).toBe('Opname Oktober');
    expect(session.freezeOutboundTransfers).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'stock_count.started',
      actorId: 'user_manager_1',
      payload: { sessionId: session.id, lineCount: 2, freeze: true },
    });
    await expect(
      startStockCount(deps, {
        ctx: ctxFor('staff'),
        workspaceId: WS,
        warehouseId: jktId,
        name: 'Overlap',
        scopeType: 'skus',
        variantIds: [variantIds[0]!, variantIds[0]!],
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'STOCK_COUNT_OVERLAP' });
    expect(events).toHaveLength(1);
  });

  it('enforces warehouse scope, freeze role and a non-empty SKU scope', async () => {
    const { deps, events, jktId, bdgId } = await seed();
    const base = {
      workspaceId: WS,
      warehouseId: jktId,
      name: 'Opname',
      scopeType: 'all' as const,
      now: NOW,
    };
    await expect(
      startStockCount(deps, { ...base, ctx: ctxFor('staff', bdgId) })
    ).rejects.toMatchObject({ code: 'STOCK_COUNT_NOT_FOUND' });
    await expect(
      startStockCount(deps, {
        ...base,
        ctx: ctxFor('admin'),
        warehouseId: 'wh_missing',
      })
    ).rejects.toMatchObject({ code: 'STOCK_COUNT_NOT_FOUND' });
    await expect(
      startStockCount(deps, {
        ...base,
        ctx: ctxFor('staff', jktId),
        freezeOutboundTransfers: true,
      })
    ).rejects.toMatchObject({ code: 'TENANCY_FORBIDDEN' });
    await expect(
      startStockCount(deps, {
        ...base,
        ctx: ctxFor('staff', jktId),
        scopeType: 'skus',
        variantIds: [],
      })
    ).rejects.toMatchObject({ code: 'STOCK_COUNT_VALIDATION' });
    expect(events).toHaveLength(0);
  });

  it('rejects zero eligible SKUs and more than MAX_SESSION_LINES', async () => {
    const empty = await seed(false);
    const input = {
      ctx: ctxFor('admin'),
      workspaceId: WS,
      warehouseId: empty.jktId,
      name: 'Kosong',
      scopeType: 'all' as const,
      now: NOW,
    };
    await expect(startStockCount(empty.deps, input)).rejects.toMatchObject({
      code: 'STOCK_COUNT_VALIDATION',
      message: 'Tidak ada SKU untuk dihitung',
    });
    const big = await seed();
    big.store.countEligibleVariants = async () => MAX_SESSION_LINES + 1;
    await expect(
      startStockCount(big.deps, { ...input, warehouseId: big.jktId })
    ).rejects.toMatchObject({ code: 'STOCK_COUNT_VALIDATION' });
    expect(
      (await big.store.listSessions({ workspaceId: WS, warehouseIds: null }))
        .length
    ).toBe(0);
    expect(empty.events.length + big.events.length).toBe(0);
  });
});
