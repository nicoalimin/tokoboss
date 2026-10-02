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

async function seedSentTransfer(
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

  const sent = await store.sendTransfer({
    workspaceId: tenant.id,
    transferId: transfer.id,
    actorId: null,
  });

  return {
    tenant,
    store,
    source,
    dest,
    variantId,
    transfer: sent.transfer,
    items: sent.items,
  };
}

describe('drizzle TransferStore receiveTransfer (UTA-117)', () => {
  it('full receive (omit items) after send marks received and credits dest', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const { tenant, store, dest, variantId, transfer, items } =
        await seedSentTransfer(db, 'acme-xfer-recv-full');

      const result = await store.receiveTransfer({
        workspaceId: tenant.id,
        transferId: transfer.id,
        actorId: null,
      });

      expect(result.transfer.status).toBe('received');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.receivedQty).toBe(items[0]!.sentQty);
      expect(result.items[0]!.sentQty).toBe(10);

      const destLevel = await store.getLevel(tenant.id, variantId, dest.id);
      expect(destLevel?.qty).toBe(10);

      const ledgerEntries = await store.listLedgerByVariant(
        tenant.id,
        variantId,
        100
      );
      const receiveEntries = ledgerEntries.filter(
        (entry) => entry.reason === 'transfer_receive'
      );
      expect(receiveEntries).toHaveLength(1);
      expect(receiveEntries[0]!.delta).toBe(10);
      expect(receiveEntries[0]!.correlationId).toBe(transfer.id);
      expect(receiveEntries[0]!.warehouseId).toBe(dest.id);
    } finally {
      await client.close();
    }
  });

  it('rejects receive on non-sent (draft) transfer', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const [tenant] = await db
        .insert(tenants)
        .values({ name: 'Acme', slug: 'acme-xfer-recv-draft' })
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
        referenceNum: 'TRF-DRAFT',
        sourceWarehouseId: source.id,
        destWarehouseId: dest.id,
      });

      await store.addTransferItems({
        workspaceId: tenant.id,
        transferId: transfer.id,
        items: [{ variantId: variantId, requestedQty: 5 }],
      });

      await expect(
        store.receiveTransfer({
          workspaceId: tenant.id,
          transferId: transfer.id,
          actorId: null,
        })
      ).rejects.toThrow('Only sent transfers can be received.');
    } finally {
      await client.close();
    }
  });

  it('throws not found for unknown transfer or wrong workspace', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const { tenant, store, transfer } = await seedSentTransfer(
        db,
        'acme-xfer-recv-nf'
      );

      await expect(
        store.receiveTransfer({
          workspaceId: tenant.id,
          transferId: '00000000-0000-4000-8000-000000000099',
          actorId: null,
        })
      ).rejects.toThrow('Transfer not found.');

      const [tenant2] = await db
        .insert(tenants)
        .values({ name: 'Beta', slug: 'beta-xfer-recv' })
        .returning({ id: tenants.id });
      if (!tenant2) throw new Error('seed tenant failed');

      await expect(
        store.receiveTransfer({
          workspaceId: tenant2.id,
          transferId: transfer.id,
          actorId: null,
        })
      ).rejects.toThrow('Transfer not found.');
    } finally {
      await client.close();
    }
  });

  it('expectedVersion mismatch rejects with version conflict', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const { tenant, store, transfer } = await seedSentTransfer(
        db,
        'acme-xfer-recv-vc'
      );

      await expect(
        store.receiveTransfer({
          workspaceId: tenant.id,
          transferId: transfer.id,
          actorId: null,
          expectedVersion: 999,
        })
      ).rejects.toThrow('This record changed. Reload and try again.');
    } finally {
      await client.close();
    }
  });
});

describe('drizzle TransferStore receiveTransfer edges (UTA-118)', () => {
  it('partial receive via items keeps sent; dest credited for good qty only; receivedQty bumped', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const { tenant, store, dest, variantId, transfer, items } =
        await seedSentTransfer(db, 'acme-xfer-recv-partial');

      const result = await store.receiveTransfer({
        workspaceId: tenant.id,
        transferId: transfer.id,
        actorId: null,
        items: [
          {
            itemId: items[0]!.id,
            receivedQty: 5,
            damagedQty: 2,
          },
        ],
      });

      expect(result.transfer.status).toBe('sent');
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.receivedQty).toBe(5);
      expect(result.items[0]!.damagedQty).toBe(2);
      expect(result.items[0]!.sentQty).toBe(10);

      const destLevel = await store.getLevel(tenant.id, variantId, dest.id);
      expect(destLevel?.qty).toBe(5);
    } finally {
      await client.close();
    }
  });

  it('partial then complete remaining becomes received; dest total equals good qty only', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const { tenant, store, dest, variantId, transfer, items } =
        await seedSentTransfer(db, 'acme-xfer-recv-partial-complete');

      const partial = await store.receiveTransfer({
        workspaceId: tenant.id,
        transferId: transfer.id,
        actorId: null,
        items: [
          {
            itemId: items[0]!.id,
            receivedQty: 4,
            damagedQty: 1,
          },
        ],
      });

      expect(partial.transfer.status).toBe('sent');
      expect(partial.items[0]!.receivedQty).toBe(4);
      expect(partial.items[0]!.damagedQty).toBe(1);

      const complete = await store.receiveTransfer({
        workspaceId: tenant.id,
        transferId: transfer.id,
        actorId: null,
        expectedVersion: partial.transfer.version,
        items: [
          {
            itemId: items[0]!.id,
            receivedQty: 5,
            damagedQty: 0,
          },
        ],
      });

      expect(complete.transfer.status).toBe('received');
      expect(complete.items[0]!.receivedQty).toBe(9);
      expect(complete.items[0]!.damagedQty).toBe(1);
      expect(
        complete.items[0]!.sentQty -
          complete.items[0]!.receivedQty -
          (complete.items[0]!.damagedQty || 0)
      ).toBe(0);

      const destLevel = await store.getLevel(tenant.id, variantId, dest.id);
      expect(destLevel?.qty).toBe(9);
    } finally {
      await client.close();
    }
  });

  it('damaged qty tracked; dest stock only gets good receivedQty', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const { tenant, store, dest, variantId, transfer, items } =
        await seedSentTransfer(db, 'acme-xfer-recv-damaged');

      const result = await store.receiveTransfer({
        workspaceId: tenant.id,
        transferId: transfer.id,
        actorId: null,
        items: [
          {
            itemId: items[0]!.id,
            receivedQty: 3,
            damagedQty: 7,
          },
        ],
      });

      expect(result.transfer.status).toBe('received');
      expect(result.items[0]!.receivedQty).toBe(3);
      expect(result.items[0]!.damagedQty).toBe(7);

      const destLevel = await store.getLevel(tenant.id, variantId, dest.id);
      expect(destLevel?.qty).toBe(3);

      const ledgerEntries = await store.listLedgerByVariant(
        tenant.id,
        variantId,
        100
      );
      const receiveEntries = ledgerEntries.filter(
        (entry) => entry.reason === 'transfer_receive'
      );
      expect(receiveEntries).toHaveLength(1);
      expect(receiveEntries[0]!.delta).toBe(3);
    } finally {
      await client.close();
    }
  });

  it('over-receive receivedQty + damagedQty > remaining rejects with validation', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const { tenant, store, transfer, items } = await seedSentTransfer(
        db,
        'acme-xfer-recv-over'
      );

      await expect(
        store.receiveTransfer({
          workspaceId: tenant.id,
          transferId: transfer.id,
          actorId: null,
          items: [
            {
              itemId: items[0]!.id,
              receivedQty: 7,
              damagedQty: 4,
            },
          ],
        })
      ).rejects.toThrow('Cannot receive more than remaining sent quantity');
    } finally {
      await client.close();
    }
  });

  it('negative receivedQty or damagedQty rejects with validation', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const { tenant, store, transfer, items } = await seedSentTransfer(
        db,
        'acme-xfer-recv-neg'
      );

      await expect(
        store.receiveTransfer({
          workspaceId: tenant.id,
          transferId: transfer.id,
          actorId: null,
          items: [
            {
              itemId: items[0]!.id,
              receivedQty: -5,
            },
          ],
        })
      ).rejects.toThrow('Received and damaged quantities must be non-negative');

      await expect(
        store.receiveTransfer({
          workspaceId: tenant.id,
          transferId: transfer.id,
          actorId: null,
          items: [
            {
              itemId: items[0]!.id,
              receivedQty: 5,
              damagedQty: -2,
            },
          ],
        })
      ).rejects.toThrow('Received and damaged quantities must be non-negative');
    } finally {
      await client.close();
    }
  });

  it('unknown itemId not-found; duplicate itemIds validation', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const { tenant, store, transfer, items } = await seedSentTransfer(
        db,
        'acme-xfer-recv-item-ids'
      );

      await expect(
        store.receiveTransfer({
          workspaceId: tenant.id,
          transferId: transfer.id,
          actorId: null,
          items: [
            {
              itemId: '00000000-0000-4000-8000-0000000000aa',
              receivedQty: 5,
            },
          ],
        })
      ).rejects.toThrow('TransferItem not found');

      await expect(
        store.receiveTransfer({
          workspaceId: tenant.id,
          transferId: transfer.id,
          actorId: null,
          items: [
            {
              itemId: items[0]!.id,
              receivedQty: 5,
            },
            {
              itemId: items[0]!.id,
              receivedQty: 3,
            },
          ],
        })
      ).rejects.toThrow('Each transfer item may only be received once');
    } finally {
      await client.close();
    }
  });
});
