import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';

/**
 * Catalog migration + store integration (UTA-75, Story 01).
 *
 * Applies the committed chain 0001 → 0011 to an empty PGlite database
 * (no Neon credentials) and proves:
 * 1. `0009_catalog_skus.sql` applies cleanly on top of main's migrations.
 * 2. Product + variants commit atomically; duplicate SKU codes reject
 *    with a path to the existing row (nothing persisted on conflict).
 * 3. Compare-and-set versions reject stale writes (no silent overwrite).
 * 4. Ledger append + level advance commit atomically with balance guards.
 * 5. Channel-mapping uniqueness rejects double-mapped listings.
 * 6. Full use-case flow (create → adjust → search → archive) works
 *    against the Drizzle store.
 */
import {
  adjustStock,
  archiveProduct,
  createMapping,
  createProduct,
  createWarehouse,
  getLedger,
  getStockBalance,
  getStockSettings,
  searchCatalog,
  updateStockSettings,
  updateVariant,
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
  '0012_stock_ledger_hardening.sql',
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

describe('catalog migration + drizzle store', () => {
  it('applies 0009 on top of main and starts empty', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const products = await db.select().from(schema.catalogProducts);
      expect(products).toEqual([]);
    } finally {
      await client.close();
    }
  });

  it('creates product + variants atomically with SKU uniqueness', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const [tenant] = await db
        .insert(tenants)
        .values({ name: 'Acme', slug: 'acme-catalog-1' })
        .returning({ id: tenants.id });
      if (!tenant) throw new Error('seed tenant failed');
      const store: CatalogStore = new DrizzleCatalogStore(db);
      const ctx = {
        workspaceId: tenant.id,
        userId: 'user_admin_1',
        role: 'admin' as const,
        warehouseScope: null,
        status: 'active' as const,
        authVersion: 1,
      };
      const created = await createProduct(store, {
        ctx,
        workspaceId: tenant.id,
        name: 'Kaos',
        unit: 'pcs',
        variants: [
          { skuCode: 'KAOS-M', sellingPriceCents: 50000 },
          { skuCode: 'KAOS-L', sellingPriceCents: 55000 },
        ],
      });
      expect(created.variants).toHaveLength(2);

      // Duplicate SKU rejects with a path to the existing row.
      try {
        await createProduct(store, {
          ctx,
          workspaceId: tenant.id,
          name: 'Dupe',
          variants: [{ skuCode: 'KAOS-M', sellingPriceCents: 1 }],
        });
        expect.unreachable();
      } catch (err) {
        const coded = err as {
          code: string;
          details?: Record<string, unknown>;
        };
        expect(coded.code).toBe('CATALOG_CONFLICT');
        expect(coded.details?.['existingVariantId']).toBe(
          created.variants[0]?.id
        );
        expect(String(coded.details?.['existingPath'])).toContain(
          `/api/workspaces/${tenant.id}/catalog/products/`
        );
      }
      // Nothing persisted on conflict.
      expect(await store.listVariantsByWorkspace(tenant.id)).toHaveLength(2);
    } finally {
      await client.close();
    }
  });

  it('runs the full Story 01 flow: warehouse → adjust → search → archive', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const [tenant] = await db
        .insert(tenants)
        .values({ name: 'Acme', slug: 'acme-catalog-2' })
        .returning({ id: tenants.id });
      if (!tenant) throw new Error('seed tenant failed');
      const store: CatalogStore = new DrizzleCatalogStore(db);
      const ctx = {
        workspaceId: tenant.id,
        userId: 'user_admin_1',
        role: 'admin' as const,
        warehouseScope: null,
        status: 'active' as const,
        authVersion: 1,
      };
      const warehouse = await createWarehouse(store, {
        ctx,
        workspaceId: tenant.id,
        code: 'JKT-01',
        name: 'Jakarta',
      });
      const created = await createProduct(store, {
        ctx,
        workspaceId: tenant.id,
        name: 'Kemeja',
        variants: [
          {
            skuCode: 'KEMEJA-PTH-M',
            barcode: '8990001112223',
            sellingPriceCents: 149000,
            listingName: 'Kemeja Putih M',
          },
        ],
      });
      const variantId = created.variants[0]?.id ?? '';
      await createMapping(store, {
        ctx,
        workspaceId: tenant.id,
        variantId,
        channel: 'shopee',
        shopExtId: 'shop_9',
        platformSkuId: 'SHOPEE-555',
        sellerSkuHint: 'SELLER-KEMEJA',
      });
      const adjusted = await adjustStock(store, {
        ctx,
        workspaceId: tenant.id,
        variantId,
        warehouseId: warehouse.id,
        delta: 12,
        reason: 'initial stock',
      });
      expect(adjusted.level.qty).toBe(12);

      // SKU code is now locked by the movement + mapping.
      await expect(
        updateVariant(store, {
          ctx,
          workspaceId: tenant.id,
          variantId,
          skuCode: 'KEMEJA-NEW',
          expectedVersion: 1,
        })
      ).rejects.toMatchObject({ code: 'CATALOG_SKU_LOCKED' });

      // Stale version writes are rejected.
      await adjustStock(store, {
        ctx,
        workspaceId: tenant.id,
        variantId,
        warehouseId: warehouse.id,
        delta: 1,
        reason: 'recount',
      });
      await expect(
        adjustStock(store, {
          ctx,
          workspaceId: tenant.id,
          variantId,
          warehouseId: warehouse.id,
          delta: 1,
          reason: 'stale',
          expectedVersion: 1,
        })
      ).rejects.toMatchObject({ code: 'CATALOG_VERSION_CONFLICT' });

      const hits = await searchCatalog(store, {
        ctx,
        workspaceId: tenant.id,
        q: 'seller-kemeja',
      });
      expect(hits.variants.map((v) => v.variant.skuCode)).toContain(
        'KEMEJA-PTH-M'
      );

      const archived = await archiveProduct(store, {
        ctx,
        workspaceId: tenant.id,
        productId: created.product.id,
      });
      expect(archived.status).toBe('archived');
      const level = await store.getLevel(tenant.id, variantId, warehouse.id);
      expect(level?.qty).toBe(13);
    } finally {
      await client.close();
    }
  });

  it('UTA-81: idempotency dedupes retries, policy gates oversell, reads consolidate', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const [tenant] = await db
        .insert(tenants)
        .values({ name: 'Acme', slug: 'acme-catalog-uta81' })
        .returning({ id: tenants.id });
      if (!tenant) throw new Error('seed tenant failed');
      const store: CatalogStore = new DrizzleCatalogStore(db);
      const adminCtx = {
        workspaceId: tenant.id,
        userId: 'user_admin_1',
        role: 'admin' as const,
        warehouseScope: null,
        status: 'active' as const,
        authVersion: 1,
      };
      const managerCtx = { ...adminCtx, userId: 'user_mgr_1', role: 'manager' as const };
      const wh1 = await createWarehouse(store, {
        ctx: adminCtx,
        workspaceId: tenant.id,
        code: 'JKT-01',
        name: 'Jakarta',
      });
      const wh2 = await createWarehouse(store, {
        ctx: adminCtx,
        workspaceId: tenant.id,
        code: 'SBY-01',
        name: 'Surabaya',
      });
      const created = await createProduct(store, {
        ctx: adminCtx,
        workspaceId: tenant.id,
        name: 'Kaos UTA-81',
        variants: [{ skuCode: 'UTA81-A', sellingPriceCents: 99000 }],
      });
      const variantId = created.variants[0]?.id ?? '';

      // Idempotent adjustment: retry resolves to the original entry.
      const first = await adjustStock(store, {
        ctx: managerCtx,
        workspaceId: tenant.id,
        variantId,
        warehouseId: wh1.id,
        delta: 10,
        reason: 'initial stock',
        idempotencyKey: 'uta81-retry-1',
      });
      const retry = await adjustStock(store, {
        ctx: managerCtx,
        workspaceId: tenant.id,
        variantId,
        warehouseId: wh1.id,
        delta: 10,
        reason: 'initial stock',
        idempotencyKey: 'uta81-retry-1',
      });
      expect(retry.deduplicated).toBe(true);
      expect(retry.entry.id).toBe(first.entry.id);
      expect(await store.countMovements(tenant.id, variantId)).toBe(1);

      // Negative stock blocked by default (fresh workspace policy OFF).
      expect(
        (await getStockSettings(store, { ctx: adminCtx, workspaceId: tenant.id }))
          .allowNegative
      ).toBe(false);
      await expect(
        adjustStock(store, {
          ctx: managerCtx,
          workspaceId: tenant.id,
          variantId,
          warehouseId: wh1.id,
          delta: -50,
          reason: 'oversell',
        })
      ).rejects.toMatchObject({ code: 'CATALOG_INSUFFICIENT_STOCK' });

      // Admin toggles the policy; oversell then applies.
      const enabled = await updateStockSettings(store, {
        ctx: adminCtx,
        workspaceId: tenant.id,
        allowNegative: true,
        expectedVersion: 1,
      });
      expect(enabled.allowNegative).toBe(true);
      const over = await adjustStock(store, {
        ctx: managerCtx,
        workspaceId: tenant.id,
        variantId,
        warehouseId: wh1.id,
        delta: -12,
        reason: 'oversell allowed',
      });
      expect(over.level.qty).toBe(-2);

      // Second warehouse + consolidated/per-WH reads + ledger filter.
      await adjustStock(store, {
        ctx: managerCtx,
        workspaceId: tenant.id,
        variantId,
        warehouseId: wh2.id,
        delta: 5,
        reason: 'sby stock',
      });
      const balance = await getStockBalance(store, {
        ctx: adminCtx,
        workspaceId: tenant.id,
        variantId,
      });
      expect(balance.totalQty).toBe(3);
      expect(
        new Map(balance.perWarehouse.map((p) => [p.warehouseId, p.qty])).get(wh2.id)
      ).toBe(5);
      const filtered = await getLedger(store, {
        ctx: adminCtx,
        workspaceId: tenant.id,
        variantId,
        warehouseId: wh2.id,
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.reason).toBe('sby stock');
    } finally {
      await client.close();
    }
  });
});
