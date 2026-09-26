import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';

/**
 * Drizzle TransferStore header draft/read (UTA-101 / Story 06).
 *
 * Applies migration chain 0001 → 0013 and proves createTransferDraft /
 * findTransferById / listTransfers against DrizzleCatalogStore.
 * Items + WithItems are out of scope (UTA-102).
 */
import {
  createWarehouse,
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

describe('drizzle TransferStore header (UTA-101)', () => {
  it('creates draft, rejects duplicate reference, isolates workspace, lists oldest-first', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const [tenantA] = await db
        .insert(tenants)
        .values({ name: 'Acme', slug: 'acme-xfer-a' })
        .returning({ id: tenants.id });
      const [tenantB] = await db
        .insert(tenants)
        .values({ name: 'Beta', slug: 'acme-xfer-b' })
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

      const draft = await store.createTransferDraft({
        workspaceId: tenantA.id,
        referenceNum: 'TRF-001',
        sourceWarehouseId: source.id,
        destWarehouseId: dest.id,
      });
      expect(draft.status).toBe('draft');
      expect(draft.version).toBe(1);
      expect(draft.notes).toBeNull();
      expect(draft.referenceNum).toBe('TRF-001');

      await expect(
        store.createTransferDraft({
          workspaceId: tenantA.id,
          referenceNum: 'TRF-001',
          sourceWarehouseId: source.id,
          destWarehouseId: dest.id,
        })
      ).rejects.toMatchObject({
        message: expect.stringContaining('TRF-001'),
      });

      const cross = await store.findTransferById(tenantB.id, draft.id);
      expect(cross).toBeNull();

      const found = await store.findTransferById(tenantA.id, draft.id);
      expect(found?.id).toBe(draft.id);

      const second = await store.createTransferDraft({
        workspaceId: tenantA.id,
        referenceNum: 'TRF-002',
        sourceWarehouseId: source.id,
        destWarehouseId: dest.id,
        notes: 'second',
      });
      expect(second.notes).toBe('second');

      const listed = await store.listTransfers(tenantA.id);
      expect(listed.map((t) => t.referenceNum)).toEqual(['TRF-001', 'TRF-002']);
      expect(listed.every((t) => t.workspaceId === tenantA.id)).toBe(true);

      const otherWs = await store.listTransfers(tenantB.id);
      expect(otherWs).toEqual([]);
    } finally {
      await client.close();
    }
  });
});
