import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';
import { DrizzleStockCountStore } from '../repositories/drizzle-stock-count-repository';
import {
  catalogInventoryLevels,
  schema,
  stockCountEntries,
  stockCountLines,
  stockCountSessions,
  tenants,
} from '../schema/index';

/** DB test: overlap index + concurrent entries (US12 / RFC 03 task 26). */

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../infra/drizzle');
const NOW = new Date('2026-10-16T04:00:00.000Z');

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

/** Tenant + warehouse + 2 variants with levels. */
async function seedCatalog(db: Db, slug: string) {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Acme', slug })
    .returning();
  const workspaceId = tenant!.id;
  const [wh] = await db
    .insert(schema.catalogWarehouses)
    .values({ workspaceId, code: 'WH-01', name: 'Main' })
    .returning();
  const warehouseId = wh!.id;
  const [product] = await db
    .insert(schema.catalogProducts)
    .values({ workspaceId, name: 'Kopi' })
    .returning();
  const variants = await db
    .insert(schema.catalogVariants)
    .values(
      [0, 1].map((i) => ({
        productId: product!.id,
        workspaceId,
        skuCode: `SKU-${i}`,
        sellingPriceCents: 1000,
      }))
    )
    .returning();
  const variantIds = variants.map((v) => v.id);
  await db.insert(catalogInventoryLevels).values(
    variantIds.map((variantId, i) => ({
      workspaceId,
      variantId,
      warehouseId,
      qty: 10 + i,
    }))
  );
  const store = new DrizzleStockCountStore(db);
  const base = {
    workspaceId,
    warehouseId,
    name: 'Opname',
    scopeType: 'skus' as const,
    freezeOutboundTransfers: false,
    actorId: 'user_admin_1',
    now: NOW,
  };
  return { store, workspaceId, warehouseId, variantIds, base };
}
describe('stock opname entries + overlap (RFC 03 task 26)', () => {
  it('rejects a second open session for the same warehouse SKU', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const s = await seedCatalog(db, 'acme-opname-overlap');
      const first = await s.store.createSession({
        ...s.base,
        variantIds: [s.variantIds[0]!],
      });
      expect(first.lineCount).toBe(1);
      await expect(
        s.store.createSession({
          ...s.base,
          name: 'Opname 2',
          variantIds: [s.variantIds[0]!],
        })
      ).rejects.toMatchObject({ code: 'STOCK_COUNT_OVERLAP' });
      // DDL backstop: second open line for same warehouse+variant fails.
      const [other] = await db
        .insert(stockCountSessions)
        .values({
          workspaceId: s.workspaceId,
          warehouseId: s.warehouseId,
          code: 'OPN-FORCE',
          name: 'Forced',
          status: 'counting',
          createdBy: 'user_admin_1',
        })
        .returning();
      await expect(
        db.insert(stockCountLines).values({
          workspaceId: s.workspaceId,
          sessionId: other!.id,
          warehouseId: s.warehouseId,
          variantId: s.variantIds[0]!,
          snapshotQty: 0,
          isOpen: true,
        })
      ).rejects.toThrow();
    } finally {
      await client.close();
    }
  });

  it('applies concurrent add entries under the line row lock', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const s = await seedCatalog(db, 'acme-opname-concurrent');
      const { session } = await s.store.createSession({
        ...s.base,
        variantIds: [s.variantIds[0]!],
      });
      const [line] = await s.store.listLines(s.workspaceId, session.id);
      const entry = {
        workspaceId: s.workspaceId,
        lineId: line!.id,
        mode: 'add' as const,
        deviceLabel: 'phone',
        actorId: 'user_staff_1',
        now: NOW,
      };
      const [a, b] = await Promise.all([
        s.store.recordEntry({ ...entry, qty: 3, clientEntryId: 'dev-a:1' }),
        s.store.recordEntry({ ...entry, qty: 4, clientEntryId: 'dev-b:1' }),
      ]);
      expect(a.deduplicated).toBe(false);
      expect(b.deduplicated).toBe(false);
      const lines = await s.store.listLines(s.workspaceId, session.id);
      expect(lines[0]).toMatchObject({ countedQty: 7, entryCount: 2 });
      const entries = await db
        .select()
        .from(stockCountEntries)
        .where(eq(stockCountEntries.lineId, line!.id));
      expect(entries).toHaveLength(2);
    } finally {
      await client.close();
    }
  });

  it('dedupes a replayed clientEntryId without double-counting', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const s = await seedCatalog(db, 'acme-opname-entry-replay');
      const { session } = await s.store.createSession({
        ...s.base,
        variantIds: [s.variantIds[0]!],
      });
      const [line] = await s.store.listLines(s.workspaceId, session.id);
      const input = {
        workspaceId: s.workspaceId,
        lineId: line!.id,
        qty: 5,
        mode: 'replace' as const,
        clientEntryId: 'dev-1:same',
        deviceLabel: null,
        actorId: 'user_staff_1',
        now: NOW,
      };
      const first = await s.store.recordEntry(input);
      const replay = await s.store.recordEntry(input);
      expect(first.deduplicated).toBe(false);
      expect(replay).toMatchObject({
        deduplicated: true,
        entry: { id: first.entry.id },
      });
      expect(replay.line.countedQty).toBe(5);
      expect(replay.line.entryCount).toBe(1);
      const entries = await db
        .select()
        .from(stockCountEntries)
        .where(eq(stockCountEntries.lineId, line!.id));
      expect(entries).toHaveLength(1);
    } finally {
      await client.close();
    }
  });
});
