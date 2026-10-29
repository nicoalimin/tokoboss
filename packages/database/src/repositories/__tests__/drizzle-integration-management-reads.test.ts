import { mapStoreSku } from '@tokoboss/application';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createMigratedDb,
  seedSkuMapping,
} from '../../__tests__/sku-mapping-pglite-fixture';
import {
  auditEvents,
  catalogWarehouses,
  marketplaceConnections,
  marketplaceInventorySyncStates,
  marketplaceLocationLinks,
  marketplaceOrderPreviews,
} from '../../schema/index';
import {
  DrizzleIntegrationActivityReads,
  DrizzleIntegrationMetricsReads,
  DrizzleInventorySyncRepository,
} from '../index';

/** PGlite tests for the RFC 07 (US18) read adapters (row 22). */

const opened: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((c) => c.close()));
});

const OTHER = '00000000-0000-4000-8000-000000000002';
const at = (minute: number) => new Date(Date.UTC(2026, 9, 28, 0, minute));

/** Fresh db; fixture store SHOP-1 with SKU-A ↔ PSKU-1 mapped, sync on. */
async function seed() {
  const { client, db } = await createMigratedDb();
  opened.push(client);
  const s = await seedSkuMapping(db);
  const { mapping } = await mapStoreSku(s.deps, s.ctx, {
    workspaceId: s.workspaceId,
    variantId: s.variantId,
    listingId: s.listingId,
  });
  const sync = new DrizzleInventorySyncRepository(db);
  await sync.writes.upsertSettings({
    workspaceId: s.workspaceId,
    mappingId: mapping.id,
    syncEnabled: true,
    stockBuffer: 0,
    allocationPct: 100,
  });
  return { ...s, db, sync, mappingId: mapping.id };
}

describe('integration management reads on PGlite (RFC 07 row 22)', () => {
  it('DrizzleIntegrationMetricsReads aggregates per store', async () => {
    const s = await seed();
    const { db, workspaceId, connectionId } = s;
    await db
      .update(marketplaceInventorySyncStates)
      .set({
        syncStatus: 'needs_attention',
        lastErrorCode: 'SYNC_RATE_LIMITED',
        lastSyncedAt: at(7),
      })
      .where(eq(marketplaceInventorySyncStates.mappingId, s.mappingId));
    const whs = await db
      .insert(catalogWarehouses)
      .values([
        { workspaceId, code: 'WH-B', name: 'Gudang B' },
        { workspaceId, code: 'WH-A', name: 'Gudang A' },
      ])
      .returning();
    await db.insert(marketplaceLocationLinks).values(
      [whs[0]!.id, whs[1]!.id, null].map((warehouseId, i) => ({
        workspaceId,
        connectionId,
        externalLocationId: `LOC-${i}`,
        warehouseId,
      }))
    );
    await db
      .insert(marketplaceOrderPreviews)
      .values({ workspaceId, connectionId, externalOrderId: 'ORDER-1' });
    const reads = new DrizzleIntegrationMetricsReads(db);
    const all = await reads.getByWorkspace(workspaceId);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      connectionId,
      mappedSkuCount: 1,
      archivedMappedSkuCount: 0,
      conflictSkuCount: 0,
      rateLimitedSkuCount: 1,
      lastStockPushAt: at(7),
      linkedWarehouseCount: 2,
      linkedWarehouseCodes: ['WH-A', 'WH-B'],
    });
    expect(all[0]!.lastOrderImportAt).toBeInstanceOf(Date);
    expect(await reads.getByConnection(workspaceId, connectionId)).toEqual(
      all[0]
    );
    expect(await reads.getByConnection(workspaceId, OTHER)).toMatchObject({
      connectionId: OTHER,
      mappedSkuCount: 0,
      linkedWarehouseCodes: [],
    });
  }, 60_000);

  it('DrizzleIntegrationActivityReads lists integration.* newest first', async () => {
    const { client, db } = await createMigratedDb();
    opened.push(client);
    const { workspaceId: ws, connectionId: c1 } = await seedSkuMapping(db);
    const user = { actorType: 'user', actorId: 'user-admin' };
    await db.insert(auditEvents).values([
      {
        ...user,
        tenantId: ws,
        action: 'integration.connected',
        payload: { connectionId: c1, provider: 'shopee', storeName: 'Toko' },
        createdAt: at(1),
      },
      {
        ...user,
        tenantId: ws,
        action: 'integration.controls_updated',
        payload: { connectionId: c1, provider: 'bogus' },
        createdAt: at(3),
      },
      {
        tenantId: ws,
        action: 'integration.token_refresh_failed',
        payload: { connectionId: OTHER },
        actorType: 'system',
        createdAt: at(2),
      },
      { tenantId: ws, action: 'membership.role_changed', createdAt: at(4) },
      { tenantId: ws, action: 'integration.unknown', createdAt: at(5) },
      { tenantId: null, action: 'integration.connected', createdAt: at(6) },
    ]);
    const reads = new DrizzleIntegrationActivityReads(db);
    const all = await reads.listByWorkspace({ workspaceId: ws, limit: 20 });
    expect(all.map((e) => e.action)).toEqual([
      'integration.controls_updated',
      'integration.token_refresh_failed',
      'integration.connected',
    ]);
    expect(all[0]).toMatchObject({ ...user, workspaceId: ws, provider: null });
    expect(all[2]).toMatchObject({
      connectionId: c1,
      provider: 'shopee',
      storeName: 'Toko',
      occurredAt: at(1),
    });
    const store = await reads.listByWorkspace({
      workspaceId: ws,
      connectionId: c1,
      limit: 1,
    });
    expect(store.map((e) => e.action)).toEqual([
      'integration.controls_updated',
    ]);
  }, 60_000);

  it('DrizzleInventorySyncReads skips stores with stock sync paused', async () => {
    const s = await seed();
    const scope = { workspaceId: s.workspaceId };
    const setStoreSync = (inventorySyncEnabled: boolean) =>
      s.db
        .update(marketplaceConnections)
        .set({ inventorySyncEnabled })
        .where(eq(marketplaceConnections.id, s.connectionId));
    const ids = () => s.sync.reads.listSyncEnabledMappingIds(scope);
    await setStoreSync(true);
    expect(await ids()).toEqual([s.mappingId]);
    await setStoreSync(false);
    expect(await ids()).toEqual([]);
    expect(await s.sync.reads.listStates(scope)).toMatchObject([
      { mappingId: s.mappingId, syncEnabled: true },
    ]);
  }, 60_000);
});
