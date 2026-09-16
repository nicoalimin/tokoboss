import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

/**
 * Bundle / BOM migration + store integration (UTA-79, Story 13).
 *
 * Applies the committed chain 0001 → 0011 to an empty PGlite database
 * (no Neon credentials) and proves:
 * 1. `0011_bundle_bom.sql` applies cleanly on top of main's migrations.
 * 2. BOM replace is atomic with the bundle version bump (compare-and-set;
 *    stale writes reject with the current version).
 * 3. `(bundle, component)` uniqueness is enforced at the DDL level.
 * 4. Component FK uses `restrict` (deleting a consumed variant fails),
 *    bundle FK uses `cascade` (deleting the shell drops its lines).
 * 5. Full use-case flow (create → no-direct-stock → cycle block →
 *    archive) works against the Drizzle store.
 */
import {
  archiveBundle,
  createBundle,
  createProduct,
  createWarehouse,
  type CatalogStore,
} from '@tokoboss/application';
import { schema, tenants } from '../schema/index';
import { DrizzleCatalogStore } from '../repositories/drizzle-catalog-repository';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../infra/drizzle');
const CHAIN = [
  '0001_initial.sql',
  '0002_initial_schema.sql',
  '0003_jobs_job_events.sql',
  '0004_file_uploads.sql',
  '0005_workspace_tenancy_audit.sql',
  '0006_auth_sessions.sql',
  '0007_workspace_invites.sql',
  '0008_user_profiles.sql',
  '0009_catalog_skus.sql',
  '0010_product_imports.sql',
  '0011_bundle_bom.sql',
];

async function createMigratedDb() {
  const client = new PGlite();
  for (const file of CHAIN) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const statements = sql
      .split(/-->\s*statement-breakpoint/g)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await client.exec(stmt);
    }
  }
  const db = drizzle(client, { schema });
  return { client, db };
}

async function seedWorkspace(db: ReturnType<typeof drizzle>) {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Acme', slug: `acme-bundles-${Date.now()}` })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('seed tenant failed');
  return tenant.id;
}

function ctxFor(workspaceId: string) {
  return {
    workspaceId,
    userId: 'user_admin_1',
    role: 'admin' as const,
    warehouseScope: null,
    status: 'active' as const,
    authVersion: 1,
  };
}

describe('bundle migration + drizzle store', () => {
  it('applies 0011 on top of main and starts empty', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const lines = await db.select().from(schema.catalogBundleLines);
      expect(lines).toEqual([]);
    } finally {
      await client.close();
    }
  });

  it('replaces BOM lines atomically with version compare-and-set', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const workspaceId = await seedWorkspace(db);
      const store: CatalogStore = new DrizzleCatalogStore(db);
      const ctx = ctxFor(workspaceId);
      const shell = await createProduct(store, {
        ctx,
        workspaceId,
        name: 'Paket',
        variants: [{ skuCode: 'BNDL-1', sellingPriceCents: 100000 }],
      });
      const comp = await createProduct(store, {
        ctx,
        workspaceId,
        name: 'Isi',
        variants: [{ skuCode: 'COMP-1', sellingPriceCents: 40000 }],
      });
      const bundleId = shell.variants[0]?.id ?? '';
      const compId = comp.variants[0]?.id ?? '';

      const created = await createBundle(store, {
        ctx,
        workspaceId,
        bundleVariantId: bundleId,
        components: [{ componentVariantId: compId, qty: 2 }],
        expectedVersion: 1,
      });
      expect(created.bundle.version).toBe(2);
      expect(created.lines).toHaveLength(1);

      // Stale version rejects with the current version; nothing changes.
      await expect(
        store.replaceBundleLines(
          workspaceId,
          bundleId,
          [{ componentVariantId: compId, qty: 9 }],
          1
        )
      ).rejects.toMatchObject({
        code: 'BUNDLE_VERSION_CONFLICT',
        details: { currentVersion: 2 },
      });
      expect(await store.listBundleLines(workspaceId, bundleId)).toHaveLength(
        1
      );

      // DDL uniqueness backstops the use-case duplicate check.
      await expect(
        store.replaceBundleLines(
          workspaceId,
          bundleId,
          [
            { componentVariantId: compId, qty: 1 },
            { componentVariantId: compId, qty: 2 },
          ],
          2
        )
      ).rejects.toMatchObject({ code: 'BUNDLE_CONFLICT' });
    } finally {
      await client.close();
    }
  });

  it('cascades shell deletes and restricts consumed components', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const workspaceId = await seedWorkspace(db);
      const store: CatalogStore = new DrizzleCatalogStore(db);
      const ctx = ctxFor(workspaceId);
      const shell = await createProduct(store, {
        ctx,
        workspaceId,
        name: 'Paket',
        variants: [{ skuCode: 'BNDL-FK', sellingPriceCents: 100000 }],
      });
      const comp = await createProduct(store, {
        ctx,
        workspaceId,
        name: 'Isi',
        variants: [{ skuCode: 'COMP-FK', sellingPriceCents: 40000 }],
      });
      const bundleId = shell.variants[0]?.id ?? '';
      const compId = comp.variants[0]?.id ?? '';
      await createBundle(store, {
        ctx,
        workspaceId,
        bundleVariantId: bundleId,
        components: [{ componentVariantId: compId, qty: 1 }],
        expectedVersion: 1,
      });

      // Deleting a consumed component fails (restrict).
      await expect(
        db
          .delete(schema.catalogVariants)
          .where(eq(schema.catalogVariants.id, compId))
      ).rejects.toThrow();

      // Deleting the shell cascades to its lines.
      await db
        .delete(schema.catalogVariants)
        .where(eq(schema.catalogVariants.id, bundleId));
      expect(await store.listBundleLines(workspaceId, bundleId)).toEqual([]);
    } finally {
      await client.close();
    }
  });

  it('runs the Story 13 flow: warehouse → BOM → guards → archive', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const workspaceId = await seedWorkspace(db);
      const store: CatalogStore = new DrizzleCatalogStore(db);
      const ctx = ctxFor(workspaceId);
      const warehouse = await createWarehouse(store, {
        ctx,
        workspaceId,
        code: 'JKT-01',
        name: 'Jakarta',
      });
      const shell = await createProduct(store, {
        ctx,
        workspaceId,
        name: 'Paket Hemat',
        variants: [{ skuCode: 'HEMAT-1', sellingPriceCents: 150000 }],
      });
      const compA = await createProduct(store, {
        ctx,
        workspaceId,
        name: 'Kopi',
        variants: [{ skuCode: 'KOPI-1', sellingPriceCents: 50000 }],
      });
      const bundleId = shell.variants[0]?.id ?? '';
      const compAId = compA.variants[0]?.id ?? '';

      const created = await createBundle(store, {
        ctx,
        workspaceId,
        bundleVariantId: bundleId,
        components: [{ componentVariantId: compAId, qty: 2 }],
        expectedVersion: 1,
      });
      expect(created.availability).toEqual([
        { warehouseId: warehouse.id, available: 0 },
      ]);

      // Self-reference is blocked against Postgres too.
      await expect(
        createBundle(store, {
          ctx,
          workspaceId,
          bundleVariantId: compAId,
          components: [{ componentVariantId: bundleId, qty: 1 }],
          expectedVersion: 1,
        })
      ).rejects.toMatchObject({ code: 'BUNDLE_CYCLE' });

      const archived = await archiveBundle(store, {
        ctx,
        workspaceId,
        bundleVariantId: bundleId,
        expectedVersion: created.bundle.version,
      });
      expect(archived.lines).toEqual([]);
    } finally {
      await client.close();
    }
  });
});
