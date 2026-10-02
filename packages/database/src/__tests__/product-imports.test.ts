import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';

/**
 * Product import migration + store integration (UTA-77, Story 02).
 *
 * Applies the committed chain 0001 → 0010 to an empty PGlite database
 * (no Neon credentials) and proves:
 * 1. `0010_product_imports.sql` applies cleanly on top of main's chain.
 * 2. Upload + parse persists a reviewable batch + rows (Drizzle store).
 * 3. Confirm creates catalog products via the UTA-75 use-cases, writes the
 *    marketplace Store SKU as a mapping candidate, and never replaces the
 *    SKU TokoBoss identity.
 * 4. Duplicate SKU codes surface the existing path (nothing overwritten).
 */
import {
  confirmImportBatch,
  createImportBatch,
  type CatalogStore,
  type ProductImportStore,
  type WorkspaceContext,
} from '@tokoboss/application';
import { schema, tenants } from '../schema/index';
import { DrizzleCatalogStore } from '../repositories/drizzle-catalog-repository';
import { DrizzleProductImportStore } from '../repositories/drizzle-product-import-repository';

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

const CSV = [
  'product_name,sku_tokoboss,price,store_sku,channel,shop_id,platform_sku_id',
  'Kemeja Linen,KEMEJA-LINEN-M,189000,SELLER-KMJ-M,shopee,shop_7,SHOPEE-1001',
  'Kemeja Linen,KEMEJA-LINEN-L,189000,,,',
].join('\n');

describe('product import migration + drizzle stores', () => {
  it('applies 0010 on top of main and starts empty', async () => {
    const { client, db } = await createMigratedDb();
    try {
      expect(await db.select().from(schema.productImportBatches)).toEqual([]);
      expect(await db.select().from(schema.productImportRows)).toEqual([]);
    } finally {
      await client.close();
    }
  });

  it('parses an upload and confirms it into the catalog', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const [tenant] = await db
        .insert(tenants)
        .values({ name: 'Acme', slug: 'acme-import-1' })
        .returning({ id: tenants.id });
      if (!tenant) throw new Error('seed tenant failed');
      const ctx: WorkspaceContext = {
        workspaceId: tenant.id,
        userId: 'user_manager_1',
        role: 'manager',
        warehouseScope: null,
        status: 'active',
        authVersion: 1,
      };
      const imports: ProductImportStore = new DrizzleProductImportStore(db);
      const catalog: CatalogStore = new DrizzleCatalogStore(db);

      const created = await createImportBatch(imports, {
        ctx,
        workspaceId: tenant.id,
        filename: 'produk.csv',
        contentType: 'text/csv',
        content: CSV,
      });
      expect(created.batch.status).toBe('review');
      expect(created.rows).toHaveLength(2);

      const result = await confirmImportBatch(imports, catalog, {
        ctx,
        workspaceId: tenant.id,
        batchId: created.batch.id,
      });
      expect(result.applied).toHaveLength(2);
      expect(result.batch.status).toBe('applied');

      // One product (grouped by name) with two SKU TokoBoss variants.
      const variants = await catalog.listVariantsByWorkspace(tenant.id);
      expect(variants.map((v) => v.skuCode).sort()).toEqual([
        'KEMEJA-LINEN-L',
        'KEMEJA-LINEN-M',
      ]);

      // Store SKU is a mapping candidate on the variant — identity intact.
      const mappings = await catalog.listMappingsByWorkspace(tenant.id);
      expect(mappings).toHaveLength(1);
      expect(mappings[0]).toMatchObject({
        channel: 'shopee',
        shopExtId: 'shop_7',
        platformSkuId: 'SHOPEE-1001',
        sellerSkuHint: 'SELLER-KMJ-M',
      });
      expect(mappings[0]?.variantId).toBe(
        variants.find((v) => v.skuCode === 'KEMEJA-LINEN-M')?.id
      );
    } finally {
      await client.close();
    }
  });

  it('rejects duplicate SKUs with the existing path (no overwrite)', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const [tenant] = await db
        .insert(tenants)
        .values({ name: 'Acme', slug: 'acme-import-2' })
        .returning({ id: tenants.id });
      if (!tenant) throw new Error('seed tenant failed');
      const ctx: WorkspaceContext = {
        workspaceId: tenant.id,
        userId: 'user_manager_1',
        role: 'manager',
        warehouseScope: null,
        status: 'active',
        authVersion: 1,
      };
      const imports: ProductImportStore = new DrizzleProductImportStore(db);
      const catalog: CatalogStore = new DrizzleCatalogStore(db);

      const first = await createImportBatch(imports, {
        ctx,
        workspaceId: tenant.id,
        filename: 'a.csv',
        contentType: 'text/csv',
        content: CSV,
      });
      await confirmImportBatch(imports, catalog, {
        ctx,
        workspaceId: tenant.id,
        batchId: first.batch.id,
      });

      const second = await createImportBatch(imports, {
        ctx,
        workspaceId: tenant.id,
        filename: 'b.csv',
        contentType: 'text/csv',
        content: CSV,
      });
      const result = await confirmImportBatch(imports, catalog, {
        ctx,
        workspaceId: tenant.id,
        batchId: second.batch.id,
      });
      expect(result.applied).toHaveLength(0);
      expect(result.duplicates).toHaveLength(2);
      expect(result.duplicates[0]?.existingPath).toContain(
        `/api/workspaces/${tenant.id}/catalog/products/`
      );
      // Still exactly two variants — the retry overwrote nothing.
      expect(await catalog.listVariantsByWorkspace(tenant.id)).toHaveLength(2);
    } finally {
      await client.close();
    }
  });
});
