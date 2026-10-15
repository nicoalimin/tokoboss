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
import { returnStockCount, submitStockCount } from '../stock-count-transitions';

const WS = 'ws_stock_count_transitions_1';
const NOW = new Date('2026-10-16T12:00:00.000Z');

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

/** Admin-started JKT session with two lines (A, B). */
async function seed() {
  const catalog = new InMemoryCatalogStore();
  const admin = ctxFor('admin');
  const jkt = await createWarehouse(catalog, {
    ctx: admin,
    workspaceId: WS,
    code: 'JKT-TX',
    name: 'Jakarta Tx',
  });
  const product = await createProduct(catalog, {
    ctx: admin,
    workspaceId: WS,
    name: 'Kaos Tx',
    unit: 'pcs',
    variants: ['A', 'B'].map((v) => ({
      skuCode: `SKU-TX-${v}`,
      name: v,
      sellingPriceCents: 10000,
      hppCents: 4000,
      costSource: 'manual' as const,
    })),
  });
  const store = new InMemoryStockCountStore(catalog);
  const events: {
    action: string;
    actorId?: string;
    payload: Record<string, unknown>;
  }[] = [];
  const audit = {
    append: async (e: {
      action: string;
      actorId?: string;
      payload: Record<string, unknown>;
    }) => {
      events.push(e);
    },
  };
  const { session } = await startStockCount(
    { store, catalog, audit },
    {
      ctx: admin,
      workspaceId: WS,
      warehouseId: jkt.id,
      name: 'Opname Tx',
      scopeType: 'all',
      now: NOW,
    }
  );
  const lines = await store.listLines(WS, session.id);
  const lineA = lines.find((l) => l.variantId === product.variants[0]!.id)!;
  return {
    deps: { store, audit },
    store,
    events,
    session,
    lineA,
    jktId: jkt.id,
  };
}

describe('submit/return (US12 / RFC 03 task 14a)', () => {
  it('Staff partial submit (1 of 2) and rejects zero-count submit', async () => {
    const { deps, store, events, session, lineA, jktId } = await seed();
    const staff = ctxFor('staff', jktId);
    await expect(
      submitStockCount(deps, {
        ctx: staff,
        workspaceId: WS,
        sessionId: session.id,
        expectedVersion: session.version,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'STOCK_COUNT_VALIDATION' });
    await recordCountEntry(
      { store },
      {
        ctx: staff,
        workspaceId: WS,
        sessionId: session.id,
        lineId: lineA.id,
        qty: 4,
        mode: 'replace',
        clientEntryId: 'tx:1',
        now: NOW,
      }
    );
    const submitted = await submitStockCount(deps, {
      ctx: staff,
      workspaceId: WS,
      sessionId: session.id,
      expectedVersion: session.version,
      note: ' sebagian ',
      now: NOW,
    });
    expect(submitted).toMatchObject({
      status: 'submitted',
      submittedBy: staff.userId,
      submitNote: 'sebagian',
    });
    expect(
      events.find((e) => e.action === 'stock_count.submitted')
    ).toMatchObject({
      actorId: staff.userId,
      payload: { countedLines: 1, excludedLines: 1 },
    });
  });

  it('Manager returns with a note; Staff return is forbidden', async () => {
    const { deps, store, session, lineA, jktId } = await seed();
    const staff = ctxFor('staff', jktId);
    const manager = ctxFor('manager', jktId);
    await recordCountEntry(
      { store },
      {
        ctx: staff,
        workspaceId: WS,
        sessionId: session.id,
        lineId: lineA.id,
        qty: 2,
        mode: 'replace',
        clientEntryId: 'tx:ret1',
        now: NOW,
      }
    );
    const submitted = await submitStockCount(deps, {
      ctx: staff,
      workspaceId: WS,
      sessionId: session.id,
      expectedVersion: session.version,
      now: NOW,
    });
    await expect(
      returnStockCount(deps, {
        ctx: staff,
        workspaceId: WS,
        sessionId: session.id,
        expectedVersion: submitted.version,
        note: 'nope',
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'TENANCY_FORBIDDEN' });
    await expect(
      returnStockCount(deps, {
        ctx: manager,
        workspaceId: WS,
        sessionId: session.id,
        expectedVersion: submitted.version,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'STOCK_COUNT_VALIDATION' });
    const returned = await returnStockCount(deps, {
      ctx: manager,
      workspaceId: WS,
      sessionId: session.id,
      expectedVersion: submitted.version,
      note: 'hitung ulang',
      now: NOW,
    });
    expect(returned).toMatchObject({
      status: 'counting',
      returnedBy: manager.userId,
      returnNote: 'hitung ulang',
    });
  });
});
