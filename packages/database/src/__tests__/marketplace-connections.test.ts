import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { InboundEventRecord } from '@tokoboss/application';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';
import { DrizzleMarketplaceStore } from '../repositories/drizzle-marketplace-store';
import {
  catalogChannelMappings,
  marketplaceInboundEvents,
  marketplaceOauthStates,
  schema,
  tenants,
} from '../schema/index';

/** DB tests: event dedupe, single-use state, mapping archive (RFC 04 task 77). */

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../infra/drizzle');
const NOW = new Date('2026-10-22T04:00:00.000Z');

async function createMigratedDb() {
  const client = new PGlite();
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
  for (const file of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    await client.exec(sql); // `--> statement-breakpoint` is a SQL comment
  }
  return { client, db: drizzle(client, { schema }) };
}
type Db = Awaited<ReturnType<typeof createMigratedDb>>['db'];

async function seedWorkspace(db: Db, slug: string) {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Acme', slug })
    .returning();
  return tenant!.id;
}

const event = (dedupeKey: string): InboundEventRecord => ({
  id: randomUUID(),
  provider: 'tiktok_shop',
  dedupeKey,
  eventType: 'ORDER_STATUS_CHANGE',
  providerStoreId: 'shop-unknown',
  connectionId: null,
  workspaceId: null,
  payload: { order_id: '1' },
  status: 'ignored',
  attempts: 0,
  processedAt: null,
  errorCode: null,
});

describe('marketplace connection DB rules (RFC 04 task 77)', () => {
  it('dedupes a replayed inbound event on (provider, dedupe_key)', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const store = new DrizzleMarketplaceStore(db);
      const first = event('tts-notif-1');
      expect(await store.events.insert(first)).toBe(true);
      expect(await store.events.insert(event('tts-notif-1'))).toBe(false);
      expect(await store.events.insert({ ...first, dedupeKey: 'x' })).toBe(
        false
      );
      const other = { ...event('tts-notif-1'), provider: 'shopee' as const };
      expect(await store.events.insert(other)).toBe(true);
      const rows = await db
        .select()
        .from(marketplaceInboundEvents)
        .where(eq(marketplaceInboundEvents.dedupeKey, 'tts-notif-1'));
      expect(rows.map((r) => r.provider).sort()).toEqual([
        'shopee',
        'tiktok_shop',
      ]);
      expect(await store.events.find(first.id)).toMatchObject({
        id: first.id,
        status: 'ignored',
        connectionId: null,
      });
    } finally {
      await client.close();
    }
  });

  it('consumes an OAuth state once and never after expiry', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const workspaceId = await seedWorkspace(db, 'acme-oauth-state');
      const store = new DrizzleMarketplaceStore(db);
      const base = {
        workspaceId,
        provider: 'shopee' as const,
        userId: 'user_admin_1',
        connectionId: null,
        consumedAt: null,
      };
      const liveId = randomUUID();
      const expiresAt = new Date(NOW.getTime() + 10 * 60_000);
      await store.oauthStates.create({ ...base, id: liveId, expiresAt }, 'h1');
      const oldAt = new Date(NOW.getTime() - 60_000);
      await store.oauthStates.create(
        { ...base, id: randomUUID(), expiresAt: oldAt },
        'h-expired'
      );
      const used = await store.oauthStates.consume('h1', NOW);
      expect(used).toMatchObject({ id: liveId, workspaceId, consumedAt: NOW });
      expect(await store.oauthStates.consume('h1', NOW)).toBeNull();
      expect(await store.oauthStates.consume('h-expired', NOW)).toBeNull();
      expect(await store.oauthStates.consume('h-missing', NOW)).toBeNull();
      const [expired] = await db
        .select()
        .from(marketplaceOauthStates)
        .where(eq(marketplaceOauthStates.stateHash, 'h-expired'));
      expect(expired!.consumedAt).toBeNull();
    } finally {
      await client.close();
    }
  });

  it('archives and unarchives only this store mappings', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const wsA = await seedWorkspace(db, 'acme-archive-a');
      const wsB = await seedWorkspace(db, 'acme-archive-b');
      const mapping = async (
        workspaceId: string,
        shop: string,
        sku: string
      ) => {
        const [product] = await db
          .insert(schema.catalogProducts)
          .values({ workspaceId, name: 'Kopi' })
          .returning();
        const [variant] = await db
          .insert(schema.catalogVariants)
          .values({
            productId: product!.id,
            workspaceId,
            skuCode: `SKU-${shop}-${sku}`,
            sellingPriceCents: 1000,
          })
          .returning();
        await db.insert(catalogChannelMappings).values({
          workspaceId,
          variantId: variant!.id,
          channel: 'shopee',
          shopExtId: shop,
          platformSkuId: sku,
        });
      };
      await mapping(wsA, 'shop-1', '11:0');
      await mapping(wsA, 'shop-1', '12:0');
      await mapping(wsA, 'shop-2', '21:0');
      await mapping(wsB, 'shop-1', '11:0');
      const listings = new DrizzleMarketplaceStore(db).listings;
      const key = {
        workspaceId: wsA,
        provider: 'shopee' as const,
        providerStoreId: 'shop-1',
      };
      expect(await listings.setMappingsArchived(key, NOW)).toBe(2);
      expect(await listings.setMappingsArchived(key, NOW)).toBe(0);
      const rows = await db.select().from(catalogChannelMappings);
      const archived = rows.filter((r) => r.archivedAt !== null);
      expect(archived).toHaveLength(2);
      expect(
        archived.every((r) => r.workspaceId === wsA && r.shopExtId === 'shop-1')
      ).toBe(true);
      expect(await listings.setMappingsArchived(key, null)).toBe(2);
      expect(await listings.setMappingsArchived(key, null)).toBe(0);
      const after = await db.select().from(catalogChannelMappings);
      expect(after.every((r) => r.archivedAt === null)).toBe(true);
    } finally {
      await client.close();
    }
  });
});
