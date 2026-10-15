import { describe, expect, it } from 'vitest';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import { InMemoryCatalogStore } from '../../catalog/in-memory-catalog-store';
import {
  createProduct,
  createWarehouse,
} from '../../catalog/catalog-use-cases';
import { InMemoryStockCountStore } from '../in-memory-stock-count-store';
import { postStockCount } from '../post-stock-count';
import { recordCountEntry } from '../record-count-entry';
import { startStockCount } from '../start-stock-count';
import { submitStockCount } from '../stock-count-transitions';

const WS = 'ws_stock_count_post_1';
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

/**
 * JKT stock A=10, B=5, C=3. Counts A=4 (-6, large_negative), B=5
 * (matched), C uncounted; counted + submitted by `submitterRole`.
 */
async function seed(submitterRole: WorkspaceContext['role'] = 'staff') {
  const catalog = new InMemoryCatalogStore();
  const admin = ctxFor('admin');
  const jkt = await createWarehouse(catalog, {
    ctx: admin,
    workspaceId: WS,
    code: 'JKT-PS',
    name: 'Jakarta PS',
  });
  const { variants } = await createProduct(catalog, {
    ctx: admin,
    workspaceId: WS,
    name: 'Kaos PS',
    unit: 'pcs',
    variants: ['A', 'B', 'C'].map((v) => ({
      skuCode: `SKU-PS-${v}`,
      name: v,
      sellingPriceCents: 10000,
      hppCents: 4000,
      costSource: 'manual' as const,
    })),
  });
  for (const [i, qty] of [10, 5, 3].entries()) {
    await catalog.adjustLevel({
      workspaceId: WS,
      variantId: variants[i]!.id,
      warehouseId: jkt.id,
      delta: qty,
      reason: 'initial stock',
      actorId: admin.userId,
    });
  }
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
      ctx: admin,
      workspaceId: WS,
      warehouseId: jkt.id,
      name: 'Opname PS',
      scopeType: 'all',
      now: NOW,
    }
  );
  const lines = await store.listLines(WS, session.id);
  const lineOf = (i: number) =>
    lines.find((l) => l.variantId === variants[i]!.id)!;
  const submitter = ctxFor(submitterRole, jkt.id);
  for (const [i, qty] of [4, 5].entries()) {
    await recordCountEntry(
      { store },
      {
        ctx: submitter,
        workspaceId: WS,
        sessionId: session.id,
        lineId: lineOf(i).id,
        qty,
        mode: 'replace',
        clientEntryId: `ps:${i}`,
        now: NOW,
      }
    );
  }
  const submitted = await submitStockCount(
    { store, audit },
    {
      ctx: submitter,
      workspaceId: WS,
      sessionId: session.id,
      expectedVersion: session.version,
      now: NOW,
    }
  );
  const base = {
    workspaceId: WS,
    sessionId: session.id,
    expectedVersion: submitted.version,
    idempotencyKey: 'post-key-0001',
    now: NOW,
    ctx: ctxFor('manager', jkt.id),
  };
  const lineA = lineOf(0);
  const review = {
    lineId: lineA.id,
    varianceReasonCode: 'lost' as const,
    flagVerified: true,
  };
  return { deps: { store, catalog, audit }, events, base, lineA, review };
}

describe('postStockCount (US12 / RFC 03 task 16)', () => {
  it('rejects Staff, bad key, missing reason, unverified flag, bare other', async () => {
    const { deps, base, lineA } = await seed();
    const post = (over: Record<string, unknown>) =>
      postStockCount(deps, { ...base, ...over });
    const staff = ctxFor('staff', lineA.warehouseId);
    await expect(post({ ctx: staff })).rejects.toMatchObject({
      code: 'TENANCY_FORBIDDEN',
    });
    for (const review of [
      { flagVerified: true },
      { varianceReasonCode: 'lost' },
      { varianceReasonCode: 'other', flagVerified: true },
    ]) {
      await expect(
        post({ lines: [{ lineId: lineA.id, ...review }] })
      ).rejects.toMatchObject({ code: 'STOCK_COUNT_VALIDATION' });
    }
    await expect(post({ idempotencyKey: 'bad key' })).rejects.toMatchObject({
      code: 'STOCK_COUNT_VALIDATION',
    });
  });

  it('Manager posts: applies -6, saves review, emits summary once', async () => {
    const { deps, events, base, lineA, review } = await seed();
    const input = { ...base, lines: [{ ...review, varianceNote: ' hilang ' }] };
    const result = await postStockCount(deps, input);
    expect(result).toMatchObject({ postedLines: 1, deduplicated: false });
    expect(result.session).toMatchObject({
      status: 'posted',
      postedBy: base.ctx.userId,
      selfApproved: false,
    });
    const level = () =>
      deps.catalog.getLevel(WS, lineA.variantId, lineA.warehouseId);
    expect((await level())?.qty).toBe(4);
    const saved = await deps.store.listLines(WS, base.sessionId);
    expect(saved.find((l) => l.id === lineA.id)).toMatchObject({
      varianceReasonCode: 'lost',
      varianceNote: 'hilang',
      flagVerified: true,
      isOpen: false,
    });
    const replay = await postStockCount(deps, input);
    expect(replay).toMatchObject({ postedLines: 1, deduplicated: true });
    expect((await level())?.qty).toBe(4);
    const posted = events.filter((e) => e.action === 'stock_count.posted');
    expect(posted).toHaveLength(1);
    expect(posted[0]!.payload).toMatchObject({
      postedLines: 1,
      matchedLines: 1,
      excludedLines: 1,
      flaggedLines: 1,
      totalDelta: -6,
      selfApproved: false,
    });
  });

  it('marks selfApproved when the poster also submitted', async () => {
    const { deps, base, review } = await seed('manager');
    const result = await postStockCount(deps, { ...base, lines: [review] });
    expect(result.session).toMatchObject({ selfApproved: true });
  });
});
