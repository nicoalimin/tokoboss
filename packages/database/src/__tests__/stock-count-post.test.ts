import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';
import { DrizzleStockCountStore } from '../repositories/drizzle-stock-count-repository';
import {
  catalogInventoryLevels,
  catalogStockLedger,
  schema,
  stockCountLines,
  stockCountSessions,
  tenants,
} from '../schema/index';

/**
 * DB test: stock opname post writer (US12 / RFC 03 task 25) on PGlite.
 * Ledger rows, forced-failure rollback, replay; 2,000-line timing later.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../infra/drizzle');
/** Per line: system qty and counted qty (+3 gain, -3 loss, 0 no movement). */
const SYSTEM = [10, 8, 4];
const COUNTED = [13, 5, 4];

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

async function seedSubmitted(db: Db, slug: string) {
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
      SYSTEM.map((_, i) => ({
        productId: product!.id,
        workspaceId,
        skuCode: `SKU-${i}`,
        sellingPriceCents: 1000,
      }))
    )
    .returning();
  const variantIds = variants.map((v) => v.id);
  await db.insert(catalogInventoryLevels).values(
    SYSTEM.map((qty, i) => ({
      workspaceId,
      variantId: variantIds[i]!,
      warehouseId,
      qty,
    }))
  );
  const [session] = await db
    .insert(stockCountSessions)
    .values({
      workspaceId,
      warehouseId,
      code: 'SO-001',
      name: 'Opname',
      status: 'submitted',
      createdBy: 'user_admin_1',
      version: 2,
    })
    .returning();
  const sessionId = session!.id;
  await db.insert(stockCountLines).values(
    SYSTEM.map((qty, i) => ({
      workspaceId,
      sessionId,
      warehouseId,
      variantId: variantIds[i]!,
      snapshotQty: qty,
      systemQtyAtCount: qty,
      countedQty: COUNTED[i]!,
    }))
  );
  const input = {
    workspaceId,
    sessionId,
    expectedVersion: 2,
    actorId: 'user_admin_1',
    selfApproved: true,
    idempotencyKey: `post:${sessionId}`,
    now: new Date('2026-10-16T03:00:00.000Z'),
  };
  const ws = eq(catalogStockLedger.workspaceId, workspaceId);
  const read = async () => {
    const levels = await db
      .select()
      .from(catalogInventoryLevels)
      .where(eq(catalogInventoryLevels.workspaceId, workspaceId));
    const qty = new Map(levels.map((l) => [l.variantId, l.qty]));
    return {
      qtys: variantIds.map((id) => qty.get(id)),
      ledger: await db.select().from(catalogStockLedger).where(ws),
      lines: await db
        .select()
        .from(stockCountLines)
        .where(eq(stockCountLines.sessionId, sessionId)),
    };
  };
  return { input, read };
}

describe('stock opname post writer (US12 / RFC 03 task 25)', () => {
  it('writes opname ledger rows, updates levels and closes lines', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const s = await seedSubmitted(db, 'acme-opname-post');
      const result = await new DrizzleStockCountStore(db).postSession(s.input);
      expect(result).toMatchObject({ postedLines: 2, deduplicated: false });
      expect(result.session).toMatchObject({ status: 'posted', version: 3 });
      const { qtys, ledger, lines } = await s.read();
      expect(qtys).toEqual([13, 5, 4]);
      expect(ledger).toHaveLength(2);
      const byId = new Map(ledger.map((r) => [r.id, r]));
      expect(lines.filter((l) => l.ledgerEntryId).length).toBe(2);
      for (const line of lines) {
        expect(line.isOpen).toBe(false);
        if (line.ledgerEntryId === null) continue;
        const delta = line.countedQty! - line.systemQtyAtCount!;
        expect(byId.get(line.ledgerEntryId)).toMatchObject({
          variantId: line.variantId,
          delta,
          reason: delta > 0 ? 'adj_opname_in' : 'adj_opname_out',
          correlationId: s.input.sessionId,
          idempotencyKey: `opname:${s.input.sessionId}:${line.id}`,
        });
      }
    } finally {
      await client.close();
    }
  });

  it('rolls back ledger, levels and lines when the post fails', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const s = await seedSubmitted(db, 'acme-opname-rollback');
      // Forced failure on the final session UPDATE, after ledger writes.
      await client.exec(`CREATE FUNCTION fail_post() RETURNS trigger LANGUAGE
        plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced post failure'; END $$;
        CREATE TRIGGER fail_post BEFORE UPDATE ON stock_count_sessions FOR
        EACH ROW WHEN (NEW.status = 'posted') EXECUTE FUNCTION fail_post();`);
      const store = new DrizzleStockCountStore(db);
      await expect(store.postSession(s.input)).rejects.toThrow();
      const { qtys, ledger, lines } = await s.read();
      expect(qtys).toEqual([10, 8, 4]);
      expect(ledger).toHaveLength(0);
      expect(lines.every((l) => l.isOpen && !l.ledgerEntryId)).toBe(true);
      const session = await store.findSession(
        s.input.workspaceId,
        s.input.sessionId
      );
      expect(session).toMatchObject({ status: 'submitted', version: 2 });
    } finally {
      await client.close();
    }
  });

  it('dedupes a replayed post without re-applying deltas', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const s = await seedSubmitted(db, 'acme-opname-replay');
      const store = new DrizzleStockCountStore(db);
      const first = await store.postSession(s.input);
      const replay = await store.postSession(s.input);
      expect(replay).toMatchObject({ postedLines: 2, deduplicated: true });
      expect(replay.session.version).toBe(first.session.version);
      const { qtys, ledger } = await s.read();
      expect(qtys).toEqual([13, 5, 4]);
      expect(ledger).toHaveLength(2);
    } finally {
      await client.close();
    }
  });
});
