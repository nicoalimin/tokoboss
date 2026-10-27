import {
  listSkuMappingHistory,
  mapStoreSku,
  unmapStoreSku,
} from '@tokoboss/application';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  catalogChannelMappingEvents,
  catalogChannelMappings,
  marketplaceListings,
  userProfiles,
} from '../schema/index';
import {
  createMigratedDb,
  type Db,
  seedSkuMapping as seed,
} from './sku-mapping-pglite-fixture';

/** PGlite tests: migration 0023, mapping_state sync, history (RFC 05 task 48b). */

const readListing = async (db: Db, id: string) =>
  (
    await db
      .select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.id, id))
  )[0]!;

describe('drizzle SKU mapping on PGlite (RFC 05 task 48b)', () => {
  it('applies 0023 and enforces one mapping per Store SKU', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const s = await seed(db);
      const res = await mapStoreSku(s.deps, s.ctx, {
        workspaceId: s.workspaceId,
        variantId: s.variantId,
        listingId: s.listingId,
      });
      const [row] = await db.select().from(catalogChannelMappings);
      expect(row).toMatchObject({
        id: res.mapping.id,
        connectionId: s.connectionId,
        externalItemId: 'ITEM-1',
        variantName: 'Hitam / L',
        mappedBy: 'user-admin',
        version: 1,
        archivedAt: null,
      });
      await expect(
        db.insert(catalogChannelMappings).values({
          workspaceId: s.workspaceId,
          variantId: s.variantId,
          channel: 'shopee',
          shopExtId: 'SHOP-1',
          platformSkuId: 'PSKU-1',
        })
      ).rejects.toThrow();
      expect(await db.select().from(catalogChannelMappings)).toHaveLength(1);
    } finally {
      await client.close();
    }
  });

  it('syncs mapping_state on map/unmap and rolls back failed writes', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const s = await seed(db);
      const { mapping } = await mapStoreSku(s.deps, s.ctx, {
        workspaceId: s.workspaceId,
        variantId: s.variantId,
        listingId: s.listingId,
      });
      expect(await readListing(db, s.listingId)).toMatchObject({
        mappingState: 'mapped',
        suggestedVariantIds: [],
      });

      await expect(
        s.repo.run(async (store) => {
          await store.recomputeListingMatchState(s.workspaceId, s.listingId);
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');
      expect((await readListing(db, s.listingId)).mappingState).toBe('mapped');

      const res = await unmapStoreSku(s.deps, s.ctx, {
        workspaceId: s.workspaceId,
        mappingId: mapping.id,
      });
      expect(res.recomputedMappingState).toBe('suggested');
      expect(await readListing(db, s.listingId)).toMatchObject({
        mappingState: 'suggested',
        suggestedVariantIds: [s.variantId],
      });
      const [row] = await db.select().from(catalogChannelMappings);
      expect(row!.archivedAt).toBeInstanceOf(Date);
    } finally {
      await client.close();
    }
  });

  it('appends history events and joins the actor display name', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const s = await seed(db);
      await db
        .insert(userProfiles)
        .values({ userId: 'user-admin', displayName: 'Rina Admin' });
      const { mapping } = await mapStoreSku(s.deps, s.ctx, {
        workspaceId: s.workspaceId,
        variantId: s.variantId,
        listingId: s.listingId,
      });
      await unmapStoreSku(s.deps, s.ctx, {
        workspaceId: s.workspaceId,
        mappingId: mapping.id,
      });

      const events = await db.select().from(catalogChannelMappingEvents);
      expect(events.map((e) => e.mappingId)).toEqual([mapping.id, mapping.id]);
      const history = await listSkuMappingHistory(s.deps, s.ctx, {
        workspaceId: s.workspaceId,
      });
      expect(
        history.map((h) => [h.action, h.skuCode, h.storeDisplayName])
      ).toEqual([
        ['unmapped', 'SKU-A', 'Toko Kopi'],
        ['mapped', 'SKU-A', 'Toko Kopi'],
      ]);
      expect(history.map((h) => h.actorDisplayName)).toEqual([
        'Rina Admin',
        'Rina Admin',
      ]);
    } finally {
      await client.close();
    }
  });
});
