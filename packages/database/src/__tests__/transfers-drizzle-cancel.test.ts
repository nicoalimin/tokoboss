import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';

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

async function seedDraftTransfer(
  db: ReturnType<typeof drizzle>,
  slug: string,
  requestedQty = 10
) {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Acme', slug })
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

  await adjustStock(store, {
    ctx,
    workspaceId: tenant.id,
    variantId: variantId,
    warehouseId: source.id,
    delta: 100,
    reason: 'initial_stock',
  });

  const transfer = await store.createTransferDraft({
    workspaceId: tenant.id,
    referenceNum: `TRF-${slug}`,
    sourceWarehouseId: source.id,
    destWarehouseId: dest.id,
  });

  await store.addTransferItems({
    workspaceId: tenant.id,
    transferId: transfer.id,
    items: [{ variantId: variantId, requestedQty }],
  });

  return {
    tenant,
    store,
    source,
    dest,
    variantId,
    transfer,
  };
}

async function seedSentTransfer(
  db: ReturnType<typeof drizzle>,
  slug: string,
  requestedQty = 10
) {
  const seeded = await seedDraftTransfer(db, slug, requestedQty);
  const sent = await seeded.store.sendTransfer({
    workspaceId: seeded.tenant.id,
    transferId: seeded.transfer.id,
    actorId: null,
  });

  return {
    ...seeded,
    transfer: sent.transfer,
    items: sent.items,
  };
}

describe('drizzle TransferStore cancelTransfer happy-path (UTA-119)', () => {
  it('cancels draft → cancelled; source/dest levels unchanged; no transfer_cancel ledger', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const { tenant, store, source, dest, variantId, transfer } =
        await seedDraftTransfer(db, 'acme-xfer-cancel-draft');

      const sourceBefore = await store.getLevel(
        tenant.id,
        variantId,
        source.id
      );
      const destBefore = await store.getLevel(tenant.id, variantId, dest.id);
      expect(sourceBefore?.qty).toBe(100);
      expect(destBefore?.qty ?? 0).toBe(0);

      const result = await store.cancelTransfer({
        workspaceId: tenant.id,
        transferId: transfer.id,
        actorId: 'actor-1',
      });

      expect(result.transfer.status).toBe('cancelled');
      expect(result.transfer.version).toBe(transfer.version + 1);

      const sourceAfter = await store.getLevel(tenant.id, variantId, source.id);
      const destAfter = await store.getLevel(tenant.id, variantId, dest.id);
      expect(sourceAfter?.qty).toBe(sourceBefore?.qty);
      expect(destAfter?.qty ?? 0).toBe(destBefore?.qty ?? 0);

      const ledgerEntries = await store.listLedgerByVariant(
        tenant.id,
        variantId,
        100
      );
      expect(
        ledgerEntries.filter((entry) => entry.reason === 'transfer_cancel')
      ).toHaveLength(0);
    } finally {
      await client.close();
    }
  });

  it('cancels sent (no receives) → cancelled; source restored by sentQty; transfer_cancel ledger +sentQty', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const { tenant, store, source, variantId, transfer, items } =
        await seedSentTransfer(db, 'acme-xfer-cancel-sent');

      const sourceBefore = await store.getLevel(
        tenant.id,
        variantId,
        source.id
      );
      expect(sourceBefore?.qty).toBe(90);
      expect(items[0]!.sentQty).toBe(10);

      const result = await store.cancelTransfer({
        workspaceId: tenant.id,
        transferId: transfer.id,
        actorId: 'actor-1',
      });

      expect(result.transfer.status).toBe('cancelled');
      expect(result.items[0]!.sentQty).toBe(10);

      const sourceAfter = await store.getLevel(tenant.id, variantId, source.id);
      expect(sourceAfter?.qty).toBe(100);

      const ledgerEntries = await store.listLedgerByVariant(
        tenant.id,
        variantId,
        100
      );
      const cancelEntries = ledgerEntries.filter(
        (entry) => entry.reason === 'transfer_cancel'
      );
      expect(cancelEntries).toHaveLength(1);
      expect(cancelEntries[0]!.delta).toBe(10);
      expect(cancelEntries[0]!.warehouseId).toBe(source.id);
      expect(cancelEntries[0]!.correlationId).toBe(transfer.id);
    } finally {
      await client.close();
    }
  });
});
