import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';

/**
 * Drizzle TransferStore items + WithItems (UTA-102 / Story 06).
 *
 * Applies migration chain 0001 → 0013 and proves addTransferItems /
 * findTransferWithItems / listTransfersWithItems against DrizzleCatalogStore.
 */
import {
  createProduct,
  createWarehouse,
  type CatalogStore,
  type TransferStore,
} from '@tokoboss/application';
import { catalogTransfers, schema, tenants } from '../schema/index';
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

describe('drizzle TransferStore items (UTA-102)', () => {
  it('adds items, rejects bad qty/status/workspace, and lists WithItems', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const [tenantA] = await db
        .insert(tenants)
        .values({ name: 'Acme', slug: 'acme-xfer-items-a' })
        .returning({ id: tenants.id });
      const [tenantB] = await db
        .insert(tenants)
        .values({ name: 'Beta', slug: 'acme-xfer-items-b' })
        .returning({ id: tenants.id });
      if (!tenantA || !tenantB) throw new Error('seed tenant failed');

      const store = new DrizzleCatalogStore(db) as CatalogStore & TransferStore;
      const ctxA = {
        workspaceId: tenantA.id,
        userId: 'user_admin_1',
        role: 'admin' as const,
        warehouseScope: null,
        status: 'active' as const,
        authVersion: 1,
      };

      const source = await createWarehouse(store, {
        ctx: ctxA,
        workspaceId: tenantA.id,
        code: 'SRC-01',
        name: 'Source WH',
      });
      const dest = await createWarehouse(store, {
        ctx: ctxA,
        workspaceId: tenantA.id,
        code: 'DST-01',
        name: 'Dest WH',
      });

      const created = await createProduct(store, {
        ctx: ctxA,
        workspaceId: tenantA.id,
        name: 'Widget',
        unit: 'pcs',
        variants: [{ skuCode: 'WGT-001', sellingPriceCents: 10000 }],
      });
      const variant = created.variants[0];
      if (!variant) throw new Error('seed variant failed');

      const draft = await store.createTransferDraft({
        workspaceId: tenantA.id,
        referenceNum: 'TRF-ITEMS-001',
        sourceWarehouseId: source.id,
        destWarehouseId: dest.id,
      });

      const items = await store.addTransferItems({
        workspaceId: tenantA.id,
        transferId: draft.id,
        items: [{ variantId: variant.id, requestedQty: 5 }],
      });
      expect(items).toHaveLength(1);
      expect(items[0]?.variantId).toBe(variant.id);
      expect(items[0]?.requestedQty).toBe(5);
      expect(items[0]?.sentQty).toBe(0);
      expect(items[0]?.receivedQty).toBe(0);
      expect(items[0]?.damagedQty).toBe(0);
      expect(items[0]?.cancellationReason).toBeNull();
      expect(items[0]?.version).toBe(1);
      expect(items[0]?.transferId).toBe(draft.id);
      expect(items[0]?.workspaceId).toBe(tenantA.id);

      await expect(
        store.addTransferItems({
          workspaceId: tenantA.id,
          transferId: draft.id,
          items: [{ variantId: variant.id, requestedQty: 0 }],
        })
      ).rejects.toMatchObject({
        message: expect.stringMatching(/quantity|greater than 0/i),
      });

      await expect(
        store.addTransferItems({
          workspaceId: tenantA.id,
          transferId: '00000000-0000-0000-0000-000000000000',
          items: [{ variantId: variant.id, requestedQty: 1 }],
        })
      ).rejects.toMatchObject({
        message: expect.stringContaining('Transfer'),
      });

      await expect(
        store.addTransferItems({
          workspaceId: tenantB.id,
          transferId: draft.id,
          items: [{ variantId: variant.id, requestedQty: 1 }],
        })
      ).rejects.toMatchObject({
        message: expect.stringContaining('Transfer'),
      });

      await db
        .update(catalogTransfers)
        .set({ status: 'cancelled' })
        .where(eq(catalogTransfers.id, draft.id));

      await expect(
        store.addTransferItems({
          workspaceId: tenantA.id,
          transferId: draft.id,
          items: [{ variantId: variant.id, requestedQty: 1 }],
        })
      ).rejects.toMatchObject({
        message: expect.stringMatching(/draft/i),
      });

      await db
        .update(catalogTransfers)
        .set({ status: 'draft' })
        .where(eq(catalogTransfers.id, draft.id));

      const withItems = await store.findTransferWithItems(tenantA.id, draft.id);
      expect(withItems).not.toBeNull();
      expect(withItems?.transfer.id).toBe(draft.id);
      expect(withItems?.items).toHaveLength(1);
      expect(withItems?.items[0]?.requestedQty).toBe(5);

      const cross = await store.findTransferWithItems(tenantB.id, draft.id);
      expect(cross).toBeNull();

      const second = await store.createTransferDraft({
        workspaceId: tenantA.id,
        referenceNum: 'TRF-ITEMS-002',
        sourceWarehouseId: source.id,
        destWarehouseId: dest.id,
      });
      await store.addTransferItems({
        workspaceId: tenantA.id,
        transferId: second.id,
        items: [{ variantId: variant.id, requestedQty: 2 }],
      });

      const listed = await store.listTransfersWithItems(tenantA.id);
      expect(listed.map((t) => t.transfer.referenceNum)).toEqual([
        'TRF-ITEMS-001',
        'TRF-ITEMS-002',
      ]);
      expect(listed.every((t) => t.transfer.workspaceId === tenantA.id)).toBe(
        true
      );
      expect(listed[0]?.items).toHaveLength(1);
      expect(listed[1]?.items).toHaveLength(1);

      const otherWs = await store.listTransfersWithItems(tenantB.id);
      expect(otherWs).toEqual([]);
    } finally {
      await client.close();
    }
  });
});
