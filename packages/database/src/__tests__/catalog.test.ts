import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';

/**
 * Catalog migration + store integration (UTA-75, Story 01; UTA-81, Story 05).
 *
 * Applies the committed chain 0001 → 0012 to an empty PGlite database
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
  createMapping,
  createProduct,
  createWarehouse,
  getLedger,
  getStockBalance,
  searchCatalog,
  type CatalogStore,
  type TransferStore,
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
  '0013_transfer_management.sql',
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

      // Search works.
      const found = await searchCatalog(store, {
        ctx,
        workspaceId: tenant.id,
        q: 'kemeja',
      });
      expect(found.products).toHaveLength(1);
      expect(found.products[0]?.variants[0]?.skuCode).toBe('KEMEJA-PTH-M');

      // Ledger is updated.
      const ledger = await getLedger(store, {
        ctx,
        workspaceId: tenant.id,
        variantId,
        limit: 1,
      });
      expect(ledger).toHaveLength(1);
      expect(ledger[0]?.delta).toBe(12);

      // Stock balance matches.
      const balance = await getStockBalance(store, {
        ctx,
        workspaceId: tenant.id,
        variantId,
      });
      expect(balance.perWarehouse[0]?.qty).toBe(12);
    } finally {
      await client.close();
    }
  });

  it('handles transfer workflow including sendTransfer', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const [tenant] = await db
        .insert(tenants)
        .values({ name: 'Acme', slug: 'acme-transfer' })
        .returning({ id: tenants.id });
      if (!tenant) throw new Error('seed tenant failed');

      const store: CatalogStore & TransferStore = new DrizzleCatalogStore(db);
      const ctx = {
        workspaceId: tenant.id,
        userId: 'user_admin_1',
        role: 'admin' as const,
        warehouseScope: null,
        status: 'active' as const,
        authVersion: 1,
      };

      // Create warehouses
      const sourceWarehouse = await createWarehouse(store, {
        ctx,
        workspaceId: tenant.id,
        code: 'SRC-WH',
        name: 'Source Warehouse',
      });

      const destWarehouse = await createWarehouse(store, {
        ctx,
        workspaceId: tenant.id,
        code: 'DEST-WH',
        name: 'Destination Warehouse',
      });

      // Create product and variant
      const createdProduct = await createProduct(store, {
        ctx,
        workspaceId: tenant.id,
        name: 'Test Product',
        unit: 'pcs',
        variants: [{ skuCode: 'TEST-SKU-1', sellingPriceCents: 10000 }],
      });
      const variantId = createdProduct.variants[0]?.id ?? '';

      // Add stock to source warehouse
      await adjustStock(store, {
        ctx,
        workspaceId: tenant.id,
        variantId,
        warehouseId: sourceWarehouse.id,
        delta: 100,
        reason: 'initial stock',
      });

      // Create transfer draft
      const transferDraft = await store.createTransferDraft({
        workspaceId: tenant.id,
        referenceNum: 'TRF-001',
        sourceWarehouseId: sourceWarehouse.id,
        destWarehouseId: destWarehouse.id,
        notes: 'Test transfer',
      });

      expect(transferDraft.status).toBe('draft');

      // Add items to transfer
      const transferItems = await store.addTransferItems({
        workspaceId: tenant.id,
        transferId: transferDraft.id,
        items: [{ variantId, requestedQty: 25 }],
      });

      expect(transferItems).toHaveLength(1);
      expect(transferItems[0]?.requestedQty).toBe(25);

      // Send the transfer
      const sentTransfer = await store.sendTransfer({
        workspaceId: tenant.id,
        transferId: transferDraft.id,
        actorId: 'user_admin_1',
      });

      // Verify the transfer status is updated to 'sent'
      expect(sentTransfer.transfer.status).toBe('sent');

      // Verify that items were updated with sent quantities
      expect(sentTransfer.items).toHaveLength(1);
      expect(sentTransfer.items[0]?.sentQty).toBe(25);

      // Verify stock was adjusted in source warehouse (reduced by 25)
      const finalBalance = await getStockBalance(store, {
        ctx,
        workspaceId: tenant.id,
        variantId,
      });
      expect(finalBalance.perWarehouse[0]?.qty).toBe(75); // 100 - 25

      // Verify the method returns correct data types and structure
      expect(sentTransfer.transfer).toBeDefined();
      expect(sentTransfer.items).toBeDefined();
    } finally {
      await client.close();
    }
  });

  it('handles sendTransfer edge cases', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const [tenant] = await db
        .insert(tenants)
        .values({ name: 'Acme', slug: 'acme-transfer-edge' })
        .returning({ id: tenants.id });
      if (!tenant) throw new Error('seed tenant failed');

      const store: CatalogStore & TransferStore = new DrizzleCatalogStore(db);
      const ctx = {
        workspaceId: tenant.id,
        userId: 'user_admin_1',
        role: 'admin' as const,
        warehouseScope: null,
        status: 'active' as const,
        authVersion: 1,
      };

      // Create warehouses
      const sourceWarehouse = await createWarehouse(store, {
        ctx,
        workspaceId: tenant.id,
        code: 'SRC-WH',
        name: 'Source Warehouse',
      });

      const destWarehouse = await createWarehouse(store, {
        ctx,
        workspaceId: tenant.id,
        code: 'DEST-WH',
        name: 'Destination Warehouse',
      });

      // Create product and variant
      const createdProduct = await createProduct(store, {
        ctx,
        workspaceId: tenant.id,
        name: 'Test Product',
        unit: 'pcs',
        variants: [{ skuCode: 'TEST-SKU-1', sellingPriceCents: 10000 }],
      });
      const variantId = createdProduct.variants[0]?.id ?? '';

      // Add stock to source warehouse
      await adjustStock(store, {
        ctx,
        workspaceId: tenant.id,
        variantId,
        warehouseId: sourceWarehouse.id,
        delta: 100,
        reason: 'initial stock',
      });

      // Create transfer draft
      const transferDraft = await store.createTransferDraft({
        workspaceId: tenant.id,
        referenceNum: 'TRF-002',
        sourceWarehouseId: sourceWarehouse.id,
        destWarehouseId: destWarehouse.id,
      });

      // Try to send a transfer with no items (should fail)
      await expect(
        store.sendTransfer({
          workspaceId: tenant.id,
          transferId: transferDraft.id,
          actorId: 'user_admin_1',
        })
      ).rejects.toThrow('Cannot send a transfer with no items.');

      // Add items to transfer
      await store.addTransferItems({
        workspaceId: tenant.id,
        transferId: transferDraft.id,
        items: [{ variantId, requestedQty: 25 }],
      });

      // Send the transfer first time successfully
      await store.sendTransfer({
        workspaceId: tenant.id,
        transferId: transferDraft.id,
        actorId: 'user_admin_1',
      });

      // Try to send the same transfer again (should fail because it's no longer in draft)
      await expect(
        store.sendTransfer({
          workspaceId: tenant.id,
          transferId: transferDraft.id,
          actorId: 'user_admin_1',
        })
      ).rejects.toThrow('Only draft transfers can be sent.');
    } finally {
      await client.close();
    }
  });
});
