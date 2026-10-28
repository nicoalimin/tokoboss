import { mapStoreSku } from '@tokoboss/application';
import { computeDesiredLocationStocks } from '@tokoboss/domain';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { DrizzleInventorySyncRepository } from '../repositories/index';
import {
  catalogInventoryLevels,
  catalogWarehouses,
  marketplaceInventorySyncEvents,
  marketplaceListings,
  marketplaceLocationLinks,
  tenants,
} from '../schema/index';
import {
  createMigratedDb,
  NOW,
  seedSkuMapping,
} from './sku-mapping-pglite-fixture';

/** PGlite tests: 0024 + DrizzleInventorySyncRepository (RFC 06 task 33). */

const opened: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((c) => c.close()));
});

/** fresh db; fixture mapping SKU-A ↔ PSKU-1 with sync on (buffer / pct). */
async function seed(stockBuffer = 0, allocationPct = 100) {
  const { client, db } = await createMigratedDb();
  opened.push(client);
  const s = await seedSkuMapping(db);
  const { mapping } = await mapStoreSku(s.deps, s.ctx, {
    workspaceId: s.workspaceId,
    variantId: s.variantId,
    listingId: s.listingId,
  });
  const repo = new DrizzleInventorySyncRepository(db);
  const ws = { workspaceId: s.workspaceId, mappingId: mapping.id };
  const on = { syncEnabled: true, stockBuffer, allocationPct };
  const upsert = (patch: Partial<typeof ws & typeof on> = {}) =>
    repo.writes.upsertSettings({ ...ws, ...on, ...patch });
  return { ...s, db, repo, ws, upsert, first: await upsert() };
}

describe('drizzle inventory sync on PGlite (RFC 06 task 33)', () => {
  it('upserts sync settings and computes multi-warehouse sellable stock', async () => {
    const s = await seed(2, 50);
    const { db } = s;
    expect(s.first).toMatchObject({ syncStatus: 'syncing', syncSeq: 1 });
    const again = await s.upsert({ stockBuffer: 1 });
    expect(again).toMatchObject({ stockBuffer: 1, syncSeq: 2, version: 2 });
    const whs = await db
      .insert(catalogWarehouses)
      .values(
        (['active', 'active', 'deactivated'] as const).map((status, i) => ({
          workspaceId: s.workspaceId,
          code: `WH-${i}`,
          name: `Gudang ${i}`,
          status,
        }))
      )
      .returning();
    await db.insert(catalogInventoryLevels).values(
      [10, 7, 50].map((qty, i) => ({
        workspaceId: s.workspaceId,
        variantId: s.variantId,
        warehouseId: whs[i]!.id,
        qty,
      }))
    );
    const { workspaceId, mappingId } = s.ws;
    const calc = async () => {
      const ctx = (await s.repo.reads.loadMappingContext(
        workspaceId,
        mappingId
      ))!;
      return computeDesiredLocationStocks({
        ...ctx.state!,
        provider: 'shopee',
        warehouses: ctx.warehouses,
        locationLinks: ctx.locationLinks,
      });
    };
    // 10 + 7 active (50 deactivated excluded) → floor(17 × 50%) − 1 = 7
    expect(await calc()).toMatchObject({
      mode: 'all_active_warehouses',
      sellableTotal: 17,
      desiredQty: 7,
    });
    await db.insert(marketplaceLocationLinks).values({
      workspaceId: s.workspaceId,
      connectionId: s.connectionId,
      externalLocationId: 'LOC-1',
      warehouseId: whs[0]!.id,
    });
    expect(await calc()).toMatchObject({
      mode: 'linked_warehouses',
      desiredQty: 4,
      targets: [{ externalLocationId: 'LOC-1', quantity: 4 }],
    });
  });

  it('CAS-commits on sync_seq and updates provider_stock', async () => {
    const s = await seed();
    const { db } = s;
    const [marked] = await s.repo.writes.markSyncing({
      workspaceId: s.workspaceId,
      variantIds: [s.variantId],
    });
    expect(marked).toMatchObject({ syncStatus: 'syncing', syncSeq: 2 });
    const commit = (attemptSeq: number) =>
      s.repo.writes.commitAttempt({
        ...s.ws,
        attemptSeq,
        outcome: 'synced',
        desiredQty: 9,
        pushedQty: 9,
        errorCode: null,
        errorMessage: null,
        at: NOW,
      });
    expect(await commit(1)).toBeNull(); // stale seq loses the CAS
    await s.repo.withTransaction(db).writes.setListingProviderStock({
      workspaceId: s.workspaceId,
      connectionId: s.connectionId,
      platformSkuId: 'PSKU-1',
      providerStock: 9,
    });
    expect(await commit(2)).toMatchObject({
      syncStatus: 'synced',
      lastPushedQty: 9,
      lastPushedSeq: 2,
    });
    const [listing] = await db
      .select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.id, s.listingId));
    expect(listing!.providerStock).toBe(9);
  });

  it('records needs_attention events and isolates workspaces', async () => {
    const s = await seed();
    const { db } = s;
    const { reads, writes } = s.repo;
    const fail = {
      ...s.ws,
      outcome: 'needs_attention',
      desiredQty: 3,
      pushedQty: null,
      errorCode: 'SYNC_NEEDS_REAUTH',
      errorMessage: null,
    } as const;
    const bad = writes.commitAttempt({ ...fail, attemptSeq: 1, at: NOW });
    expect(await bad).toMatchObject({ lastErrorCode: 'SYNC_NEEDS_REAUTH' });
    await writes.appendEvent({
      ...fail,
      variantId: s.variantId,
      connectionId: s.connectionId,
      channel: 'shopee',
      shopExtId: 'SHOP-1',
      platformSkuId: 'PSKU-1',
      syncSeq: 1,
      trigger: 'manual_retry',
      actorId: null,
      correlationId: null,
    });
    const events = await db.select().from(marketplaceInventorySyncEvents);
    expect(events).toMatchObject([{ outcome: 'needs_attention' }]);
    const attention = await reads.listAttention(s.ws);
    expect(attention).toMatchObject([{ errorCode: 'SYNC_NEEDS_REAUTH' }]);
    const [other] = await db
      .insert(tenants)
      .values({ name: 'Other', slug: 'other-sync' })
      .returning();
    const ow = { ...s.ws, workspaceId: other!.id };
    const seen = await Promise.all([
      reads.listAttention(ow),
      reads.listStates(ow),
      writes.markSyncing(ow),
      reads.loadMappingContext(ow.workspaceId, ow.mappingId),
    ]);
    expect(seen).toEqual([[], [], [], null]);
    await expect(s.upsert({ workspaceId: ow.workspaceId })).rejects.toThrow();
  });
});
