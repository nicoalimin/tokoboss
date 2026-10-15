import { describe, expect, it } from 'vitest';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import { InMemoryCatalogStore } from '../../catalog/in-memory-catalog-store';
import {
  createProduct,
  createWarehouse,
} from '../../catalog/catalog-use-cases';
import { InMemoryStockCountStore } from '../in-memory-stock-count-store';
import { startStockCount } from '../start-stock-count';
import {
  cancelStockCount,
  setStockCountFreeze,
} from '../stock-count-cancel-freeze';

const WS = 'ws_stock_count_cancel_freeze_1';
const NOW = new Date('2026-10-16T12:00:00.000Z');

function ctxFor(
  role: WorkspaceContext['role'],
  warehouseScope: string | null = null,
  n = 1
): WorkspaceContext {
  return {
    workspaceId: WS,
    userId: `user_${role}_${n}`,
    role,
    warehouseScope,
    status: 'active',
    authVersion: 1,
  };
}

/** JKT session with two lines (A, B), started by `starter` (default admin). */
async function seed(starterFor?: (jktId: string) => WorkspaceContext) {
  const catalog = new InMemoryCatalogStore();
  const admin = ctxFor('admin');
  const jkt = await createWarehouse(catalog, {
    ctx: admin,
    workspaceId: WS,
    code: 'JKT-CF',
    name: 'Jakarta CF',
  });
  await createProduct(catalog, {
    ctx: admin,
    workspaceId: WS,
    name: 'Kaos CF',
    unit: 'pcs',
    variants: ['A', 'B'].map((v) => ({
      skuCode: `SKU-CF-${v}`,
      name: v,
      sellingPriceCents: 10000,
      hppCents: 4000,
      costSource: 'manual' as const,
    })),
  });
  const store = new InMemoryStockCountStore(catalog);
  const events: { action: string; payload: Record<string, unknown> }[] = [];
  const audit = {
    append: async (e: { action: string; payload: Record<string, unknown> }) => {
      events.push(e);
    },
  };
  const { session } = await startStockCount(
    { store, catalog, audit },
    {
      ctx: starterFor ? starterFor(jkt.id) : admin,
      workspaceId: WS,
      warehouseId: jkt.id,
      name: 'Opname CF',
      scopeType: 'all',
      now: NOW,
    }
  );
  return { deps: { store, audit }, store, events, session, jktId: jkt.id };
}

describe('cancel/freeze (US12 / RFC 03 task 14b)', () => {
  it('cancel needs Manager/Admin + reason and closes every line', async () => {
    const { deps, store, events, session, jktId } = await seed();
    const base = {
      workspaceId: WS,
      sessionId: session.id,
      expectedVersion: session.version,
      now: NOW,
    };
    await expect(
      cancelStockCount(deps, {
        ...base,
        ctx: ctxFor('staff', jktId),
        note: 'x',
      })
    ).rejects.toMatchObject({ code: 'TENANCY_FORBIDDEN' });
    const manager = ctxFor('manager', jktId);
    await expect(
      cancelStockCount(deps, { ...base, ctx: manager, note: '  ' })
    ).rejects.toMatchObject({ code: 'STOCK_COUNT_VALIDATION' });
    const cancelled = await cancelStockCount(deps, {
      ...base,
      ctx: manager,
      note: ' salah gudang ',
    });
    expect(cancelled).toMatchObject({
      status: 'cancelled',
      cancelledBy: manager.userId,
      cancelReason: 'salah gudang',
    });
    const lines = await store.listLines(WS, session.id);
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => !l.isOpen)).toBe(true);
    expect(
      events.find((e) => e.action === 'stock_count.cancelled')
    ).toMatchObject({ payload: { reason: 'salah gudang' } });
    await expect(
      cancelStockCount(deps, {
        ...base,
        ctx: manager,
        expectedVersion: cancelled.version,
        note: 'lagi',
      })
    ).rejects.toMatchObject({ code: 'STOCK_COUNT_VALIDATION' });
  });

  it('Staff creator may cancel own counting session', async () => {
    const { deps, session, jktId } = await seed((id) => ctxFor('staff', id));
    const cancelled = await cancelStockCount(deps, {
      ctx: ctxFor('staff', jktId),
      workspaceId: WS,
      sessionId: session.id,
      expectedVersion: session.version,
      note: 'batal',
      now: NOW,
    });
    expect(cancelled).toMatchObject({ status: 'cancelled' });
  });

  it('freeze toggles for Manager while counting only', async () => {
    const { deps, events, session, jktId } = await seed();
    const manager = ctxFor('manager', jktId);
    const base = { workspaceId: WS, sessionId: session.id, now: NOW };
    await expect(
      setStockCountFreeze(deps, {
        ...base,
        ctx: ctxFor('staff', jktId),
        expectedVersion: session.version,
        freeze: true,
      })
    ).rejects.toMatchObject({ code: 'TENANCY_FORBIDDEN' });
    const frozen = await setStockCountFreeze(deps, {
      ...base,
      ctx: manager,
      expectedVersion: session.version,
      freeze: true,
    });
    expect(frozen.freezeOutboundTransfers).toBe(true);
    expect(
      events.find((e) => e.action === 'stock_count.freeze_changed')
    ).toMatchObject({ payload: { sessionId: session.id, freeze: true } });
    const cancelled = await cancelStockCount(deps, {
      ...base,
      ctx: manager,
      expectedVersion: frozen.version,
      note: 'stop',
    });
    await expect(
      setStockCountFreeze(deps, {
        ...base,
        ctx: manager,
        expectedVersion: cancelled.version,
        freeze: false,
      })
    ).rejects.toMatchObject({ code: 'STOCK_COUNT_VALIDATION' });
  });
});
