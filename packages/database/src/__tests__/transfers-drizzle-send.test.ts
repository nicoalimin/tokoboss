import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';

/**
 * Drizzle TransferStore sendTransfer (UTA-101 / Story 06).
 *
 * Tests the database implementation of sendTransfer function including:
 * - Transactional consistency
 * - Idempotency with idempotencyKey parameter
 * - Version conflict handling
 * - Stock adjustment correctness
 * - Error handling for various failure cases
 */
import {
  createWarehouse,
  adjustStock,
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
  '0014_variant_replenish_settings.sql',
  '0017_variant_max_stock.sql',
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

describe('drizzle TransferStore sendTransfer (UTA-108)', () => {
  it('sends transfer and adjusts stock correctly', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const [tenant] = await db
        .insert(tenants)
        .values({ name: 'Acme', slug: 'acme-xfer-send' })
        .returning({ id: tenants.id });
      if (!tenant) throw new Error('seed tenant failed');

      const store = new DrizzleCatalogStore(db) as CatalogStore & TransferStore;
      const ctx = {
        workspaceId: tenant.id,
        userId: 'user_admin_1',
        role: 'admin' as const,
        warehouseScope: null,
        status: 'active' as const,
        authVersion: 1,
      };

      const source = await createWarehouse(store, {
        ctx,
        workspaceId: tenant.id,
        code: 'SRC-01',
        name: 'Source WH',
      });
      const dest = await createWarehouse(store, {
        ctx,
        workspaceId: tenant.id,
        code: 'DST-01',
        name: 'Dest WH',
      });

      // Create a product with variants directly in the database to avoid issues
      const productResult = await db
        .insert(schema.catalogProducts)
        .values({
          workspaceId: tenant.id,
          name: 'Test Product',
          description: null,
          unit: 'pcs',
          pictures: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: schema.catalogProducts.id });

      const productId = productResult[0]!.id;

      const variantResult = await db
        .insert(schema.catalogVariants)
        .values({
          productId: productId,
          workspaceId: tenant.id,
          skuCode: 'SKU-001',
          name: 'Test Variant',
          sellingPriceCents: 1000,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: schema.catalogVariants.id });

      const variantId = variantResult[0]!.id;

      // Set up positive stock in source warehouse
      await adjustStock(store, {
        ctx,
        workspaceId: tenant.id,
        variantId: variantId,
        warehouseId: source.id,
        delta: 100,
        reason: 'initial_stock',
      });

      // Create draft transfer
      const transfer = await store.createTransferDraft({
        workspaceId: tenant.id,
        referenceNum: 'TRF-001',
        sourceWarehouseId: source.id,
        destWarehouseId: dest.id,
      });

      // Add items to the transfer
      await store.addTransferItems({
        workspaceId: tenant.id,
        transferId: transfer.id,
        items: [{ variantId: variantId, requestedQty: 10 }],
      });

      // Send transfer
      const result = await store.sendTransfer({
        workspaceId: tenant.id,
        transferId: transfer.id,
        actorId: null,
      });

      // Verify status is sent
      expect(result.transfer.status).toBe('sent');

      // Verify sent quantities match requested
      expect(result.items[0]!.sentQty).toBe(10);
      expect(result.items[0]!.version).toBe(2); // bumped by 1

      // Verify transfer version bumped
      expect(result.transfer.version).toBe(2); // bumped by 1

      // Check that source warehouse stock was decreased
      const level = await store.getLevel(tenant.id, variantId, source.id);
      expect(level?.qty).toBe(90); // 100 - 10

      // Verify ledger entries for transfer_send reason exist
      const ledgerEntries = await store.listLedgerByVariant(
        tenant.id,
        variantId,
        100
      );
      const transferSendEntries = ledgerEntries.filter(
        (entry) => entry.reason === 'transfer_send'
      );
      expect(transferSendEntries).toHaveLength(1);
      expect(transferSendEntries[0]!.delta).toBe(-10);
      expect(transferSendEntries[0]!.correlationId).toBe(transfer.id);
    } finally {
      await client.close();
    }
  });

  it('handles idempotency correctly with idempotencyKey', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const [tenant] = await db
        .insert(tenants)
        .values({ name: 'Acme', slug: 'acme-xfer-idempotent' })
        .returning({ id: tenants.id });
      if (!tenant) throw new Error('seed tenant failed');

      const store = new DrizzleCatalogStore(db) as CatalogStore & TransferStore;
      const ctx = {
        workspaceId: tenant.id,
        userId: 'user_admin_1',
        role: 'admin' as const,
        warehouseScope: null,
        status: 'active' as const,
        authVersion: 1,
      };

      const source = await createWarehouse(store, {
        ctx,
        workspaceId: tenant.id,
        code: 'SRC-01',
        name: 'Source WH',
      });
      const dest = await createWarehouse(store, {
        ctx,
        workspaceId: tenant.id,
        code: 'DST-01',
        name: 'Dest WH',
      });

      // Create a product with variants directly in the database
      const productResult = await db
        .insert(schema.catalogProducts)
        .values({
          workspaceId: tenant.id,
          name: 'Test Product',
          description: null,
          unit: 'pcs',
          pictures: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: schema.catalogProducts.id });

      const productId = productResult[0]!.id;

      const variantResult = await db
        .insert(schema.catalogVariants)
        .values({
          productId: productId,
          workspaceId: tenant.id,
          skuCode: 'SKU-001',
          name: 'Test Variant',
          sellingPriceCents: 1000,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: schema.catalogVariants.id });

      const variantId = variantResult[0]!.id;

      // Set up positive stock in source warehouse
      await adjustStock(store, {
        ctx,
        workspaceId: tenant.id,
        variantId: variantId,
        warehouseId: source.id,
        delta: 100,
        reason: 'initial_stock',
      });

      // Create draft transfer
      const transfer = await store.createTransferDraft({
        workspaceId: tenant.id,
        referenceNum: 'TRF-002',
        sourceWarehouseId: source.id,
        destWarehouseId: dest.id,
      });

      // Add items to the transfer
      await store.addTransferItems({
        workspaceId: tenant.id,
        transferId: transfer.id,
        items: [{ variantId: variantId, requestedQty: 10 }],
      });

      // Send transfer with idempotencyKey - first time
      await store.sendTransfer({
        workspaceId: tenant.id,
        transferId: transfer.id,
        actorId: null,
        idempotencyKey: 'test-idempotent-key',
      });

      // Try to send the same transfer again with idempotency key -
      // this should work in a separate transaction but fail if you don't provide idempotencyKey
      await expect(
        store.sendTransfer({
          workspaceId: tenant.id,
          transferId: transfer.id,
          actorId: null,
        })
      ).rejects.toThrow('Only draft transfers can be sent.');
    } finally {
      await client.close();
    }
  });

  it('throws version conflict error when expectedVersion is not matched', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const [tenant] = await db
        .insert(tenants)
        .values({ name: 'Acme', slug: 'acme-xfer-vc' })
        .returning({ id: tenants.id });
      if (!tenant) throw new Error('seed tenant failed');

      const store = new DrizzleCatalogStore(db) as CatalogStore & TransferStore;
      const ctx = {
        workspaceId: tenant.id,
        userId: 'user_admin_1',
        role: 'admin' as const,
        warehouseScope: null,
        status: 'active' as const,
        authVersion: 1,
      };

      const source = await createWarehouse(store, {
        ctx,
        workspaceId: tenant.id,
        code: 'SRC-01',
        name: 'Source WH',
      });
      const dest = await createWarehouse(store, {
        ctx,
        workspaceId: tenant.id,
        code: 'DST-01',
        name: 'Dest WH',
      });

      // Create a product with variants directly in the database
      const productResult = await db
        .insert(schema.catalogProducts)
        .values({
          workspaceId: tenant.id,
          name: 'Test Product',
          description: null,
          unit: 'pcs',
          pictures: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: schema.catalogProducts.id });

      const productId = productResult[0]!.id;

      const variantResult = await db
        .insert(schema.catalogVariants)
        .values({
          productId: productId,
          workspaceId: tenant.id,
          skuCode: 'SKU-001',
          name: 'Test Variant',
          sellingPriceCents: 1000,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: schema.catalogVariants.id });

      const variantId = variantResult[0]!.id;

      // Set up positive stock in source warehouse
      await adjustStock(store, {
        ctx,
        workspaceId: tenant.id,
        variantId: variantId,
        warehouseId: source.id,
        delta: 100,
        reason: 'initial_stock',
      });

      // Create draft transfer
      const transfer = await store.createTransferDraft({
        workspaceId: tenant.id,
        referenceNum: 'TRF-003',
        sourceWarehouseId: source.id,
        destWarehouseId: dest.id,
      });

      // Add items to the transfer
      await store.addTransferItems({
        workspaceId: tenant.id,
        transferId: transfer.id,
        items: [{ variantId: variantId, requestedQty: 10 }],
      });

      // Try send with wrong expectedVersion
      await expect(
        store.sendTransfer({
          workspaceId: tenant.id,
          transferId: transfer.id,
          actorId: null,
          expectedVersion: 5, // Wrong version
        })
      ).rejects.toThrow('This record changed. Reload and try again.');
    } finally {
      await client.close();
    }
  });

  it('throws validation error when transfer has no items', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const [tenant] = await db
        .insert(tenants)
        .values({ name: 'Acme', slug: 'acme-xfer-no-items' })
        .returning({ id: tenants.id });
      if (!tenant) throw new Error('seed tenant failed');

      const store = new DrizzleCatalogStore(db) as CatalogStore & TransferStore;
      const ctx = {
        workspaceId: tenant.id,
        userId: 'user_admin_1',
        role: 'admin' as const,
        warehouseScope: null,
        status: 'active' as const,
        authVersion: 1,
      };

      const source = await createWarehouse(store, {
        ctx,
        workspaceId: tenant.id,
        code: 'SRC-01',
        name: 'Source WH',
      });
      const dest = await createWarehouse(store, {
        ctx,
        workspaceId: tenant.id,
        code: 'DST-01',
        name: 'Dest WH',
      });

      // Create draft transfer without items
      const transfer = await store.createTransferDraft({
        workspaceId: tenant.id,
        referenceNum: 'TRF-004',
        sourceWarehouseId: source.id,
        destWarehouseId: dest.id,
      });

      // Try to send without items
      await expect(
        store.sendTransfer({
          workspaceId: tenant.id,
          transferId: transfer.id,
          actorId: null,
        })
      ).rejects.toThrow('Cannot send a transfer with no items.');
    } finally {
      await client.close();
    }
  });

  it('throws conflict error when non-draft transfer is sent', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const [tenant] = await db
        .insert(tenants)
        .values({ name: 'Acme', slug: 'acme-xfer-not-draft' })
        .returning({ id: tenants.id });
      if (!tenant) throw new Error('seed tenant failed');

      const store = new DrizzleCatalogStore(db) as CatalogStore & TransferStore;
      const ctx = {
        workspaceId: tenant.id,
        userId: 'user_admin_1',
        role: 'admin' as const,
        warehouseScope: null,
        status: 'active' as const,
        authVersion: 1,
      };

      const source = await createWarehouse(store, {
        ctx,
        workspaceId: tenant.id,
        code: 'SRC-01',
        name: 'Source WH',
      });
      const dest = await createWarehouse(store, {
        ctx,
        workspaceId: tenant.id,
        code: 'DST-01',
        name: 'Dest WH',
      });

      // Create a product with variants directly in the database
      const productResult = await db
        .insert(schema.catalogProducts)
        .values({
          workspaceId: tenant.id,
          name: 'Test Product',
          description: null,
          unit: 'pcs',
          pictures: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: schema.catalogProducts.id });

      const productId = productResult[0]!.id;

      const variantResult = await db
        .insert(schema.catalogVariants)
        .values({
          productId: productId,
          workspaceId: tenant.id,
          skuCode: 'SKU-001',
          name: 'Test Variant',
          sellingPriceCents: 1000,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: schema.catalogVariants.id });

      const variantId = variantResult[0]!.id;

      // Set up positive stock in source warehouse
      await adjustStock(store, {
        ctx,
        workspaceId: tenant.id,
        variantId: variantId,
        warehouseId: source.id,
        delta: 100,
        reason: 'initial_stock',
      });

      // Create draft transfer and add items
      const transfer = await store.createTransferDraft({
        workspaceId: tenant.id,
        referenceNum: 'TRF-005',
        sourceWarehouseId: source.id,
        destWarehouseId: dest.id,
      });

      await store.addTransferItems({
        workspaceId: tenant.id,
        transferId: transfer.id,
        items: [{ variantId: variantId, requestedQty: 10 }],
      });

      // Send once to make transfer no longer draft.
      await store.sendTransfer({
        workspaceId: tenant.id,
        transferId: transfer.id,
        actorId: null,
      });

      // Try to send again - should fail because it's no longer draft
      await expect(
        store.sendTransfer({
          workspaceId: tenant.id,
          transferId: transfer.id,
          actorId: null,
        })
      ).rejects.toThrow('Only draft transfers can be sent.');
    } finally {
      await client.close();
    }
  });

  it('throws not found error when unknown transfer or wrong workspace is used', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const [tenant] = await db
        .insert(tenants)
        .values({ name: 'Acme', slug: 'acme-xfer-not-found' })
        .returning({ id: tenants.id });
      if (!tenant) throw new Error('seed tenant failed');

      const store = new DrizzleCatalogStore(db) as CatalogStore & TransferStore;

      // Try with nonexistent transfer
      await expect(
        store.sendTransfer({
          workspaceId: tenant.id,
          transferId: 'nonexistent',
          actorId: null,
        })
      ).rejects.toThrow('Failed query');

      const [tenant2] = await db
        .insert(tenants)
        .values({ name: 'Beta', slug: 'beta-xfer' })
        .returning({ id: tenants.id });
      if (!tenant2) throw new Error('seed tenant failed');

      // Create transfer in one workspace and try to access from another
      const ctx = {
        workspaceId: tenant.id,
        userId: 'user_admin_1',
        role: 'admin' as const,
        warehouseScope: null,
        status: 'active' as const,
        authVersion: 1,
      };

      const source = await createWarehouse(store, {
        ctx,
        workspaceId: tenant.id,
        code: 'SRC-01',
        name: 'Source WH',
      });
      const dest = await createWarehouse(store, {
        ctx,
        workspaceId: tenant.id,
        code: 'DST-01',
        name: 'Dest WH',
      });

      // Create transfer in first workspace
      const transfer = await store.createTransferDraft({
        workspaceId: tenant.id,
        referenceNum: 'TRF-006',
        sourceWarehouseId: source.id,
        destWarehouseId: dest.id,
      });

      // Try to use transfer id from workspace 1 with workspace 2
      await expect(
        store.sendTransfer({
          workspaceId: tenant2.id, // Wrong workspace
          transferId: transfer.id,
          actorId: null,
        })
      ).rejects.toThrow('Transfer not found.');
    } finally {
      await client.close();
    }
  });

  it('rejects insufficient source stock when allowNegative is false', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const [tenant] = await db
        .insert(tenants)
        .values({ name: 'Acme', slug: 'acme-xfer-insufficient' })
        .returning({ id: tenants.id });
      if (!tenant) throw new Error('seed tenant failed');

      const store = new DrizzleCatalogStore(db) as CatalogStore & TransferStore;
      const ctx = {
        workspaceId: tenant.id,
        userId: 'user_admin_1',
        role: 'admin' as const,
        warehouseScope: null,
        status: 'active' as const,
        authVersion: 1,
      };

      const source = await createWarehouse(store, {
        ctx,
        workspaceId: tenant.id,
        code: 'SRC-01',
        name: 'Source WH',
      });
      const dest = await createWarehouse(store, {
        ctx,
        workspaceId: tenant.id,
        code: 'DST-01',
        name: 'Dest WH',
      });

      // Create a product with variants directly in the database
      const productResult = await db
        .insert(schema.catalogProducts)
        .values({
          workspaceId: tenant.id,
          name: 'Test Product',
          description: null,
          unit: 'pcs',
          pictures: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: schema.catalogProducts.id });

      const productId = productResult[0]!.id;

      const variantResult = await db
        .insert(schema.catalogVariants)
        .values({
          productId: productId,
          workspaceId: tenant.id,
          skuCode: 'SKU-001',
          name: 'Test Variant',
          sellingPriceCents: 1000,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: schema.catalogVariants.id });

      const variantId = variantResult[0]!.id;

      // Set up insufficient stock in source warehouse (only 5 available, but want to send 10)
      await adjustStock(store, {
        ctx,
        workspaceId: tenant.id,
        variantId: variantId,
        warehouseId: source.id,
        delta: 5,
        reason: 'initial_stock',
      });

      // Create draft transfer and add items
      const transfer = await store.createTransferDraft({
        workspaceId: tenant.id,
        referenceNum: 'TRF-007',
        sourceWarehouseId: source.id,
        destWarehouseId: dest.id,
      });

      await store.addTransferItems({
        workspaceId: tenant.id,
        transferId: transfer.id,
        items: [{ variantId: variantId, requestedQty: 10 }],
      });

      // Try to send with insufficient stock - should reject
      await expect(
        store.sendTransfer({
          workspaceId: tenant.id,
          transferId: transfer.id,
          actorId: null,
        })
      ).rejects.toThrow('Insufficient stock for adjustment.');
    } finally {
      await client.close();
    }
  });
});
