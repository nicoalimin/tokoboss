import { describe, expect, it } from 'vitest';
import { InMemoryCatalogStore } from '../../catalog/in-memory-catalog-store';
import { listProducts } from '../../catalog/catalog-use-cases';
import { InMemoryJobStore } from '../../jobs/in-memory-job-store';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import { InMemoryImportStore } from '../in-memory-import-store';
import {
  confirmImportBatch,
  createImportBatch,
  getImportBatch,
  rejectImportBatch,
  reopenImportBatch,
  updateImportRow,
} from '../import-use-cases';

/**
 * Unstructured product import pipeline (UTA-77, Story 02): upload+parse →
 * review/edit → confirm-before-create via the catalog use-cases, with the
 * marketplace Store SKU freeze (candidate mapping only, never identity).
 */

const ADMIN_CTX: WorkspaceContext = {
  workspaceId: 'ws_import_1',
  userId: 'user_admin_1',
  role: 'admin',
  warehouseScope: null,
  status: 'active',
  authVersion: 1,
};

const MANAGER_CTX: WorkspaceContext = {
  ...ADMIN_CTX,
  userId: 'user_manager_1',
  role: 'manager',
};

const STAFF_CTX: WorkspaceContext = {
  ...ADMIN_CTX,
  userId: 'user_staff_1',
  role: 'staff',
};

const CSV = [
  'product_name,sku_tokoboss,variant_name,price,store_sku,channel,shop_id,platform_sku_id',
  'Kaos Polos,KAOS-MERAH-M,Merah / M,99000,SELLER-KAOS-M,shopee,shop_42,SHOPEE-9001',
  'Kaos Polos,KAOS-PUTIH-L,Putih / L,99000,,,',
  'Topi Rimba,,One Size,45000,,,',
].join('\n');

async function seedBatch(store = new InMemoryImportStore(), ctx = MANAGER_CTX) {
  const jobs = new InMemoryJobStore();
  const result = await createImportBatch(
    store,
    {
      ctx,
      workspaceId: ctx.workspaceId,
      filename: 'produk.csv',
      contentType: 'text/csv',
      content: CSV,
      idempotencyKey: `key_${Math.random().toString(36).slice(2)}`,
    },
    { runner: jobs, store: jobs }
  );
  return { store, jobs, ...result };
}

describe('createImportBatch (upload + parse)', () => {
  it('creates a reviewable batch with generated SKUs and job linkage', async () => {
    const { batch, rows, duplicate, jobId, jobs } = await seedBatch();
    expect(duplicate).toBe(false);
    expect(batch.status).toBe('review');
    expect(batch.totalRows).toBe(3);
    expect(batch.readyRows).toBe(3);
    expect(jobId).not.toBeNull();
    expect(batch.jobId).toBe(jobId);

    const events = await jobs.listEvents(jobId ?? '', ADMIN_CTX.workspaceId);
    expect(events.map((e) => e.type)).toEqual([
      'queued',
      'started',
      'completed',
    ]);

    const bySku = new Map(rows.map((r) => [r.skuCode, r]));
    expect(bySku.get('KAOS-MERAH-M')?.status).toBe('review');
    // Blank sku_tokoboss → server-generated TokoBoss identity.
    const generated = rows.find((r) => r.productName === 'Topi Rimba');
    expect(generated?.skuCode).toMatch(/^IMP-0003-/);
    // Marketplace Store SKU stays a candidate, never the identity.
    expect(bySku.get('KAOS-MERAH-M')?.sellerSkuHint).toBe('SELLER-KAOS-M');
    expect(bySku.get('KAOS-MERAH-M')?.platformSkuId).toBe('SHOPEE-9001');
  });

  it('marks invalid rows draft and keeps the batch reviewable', async () => {
    const store = new InMemoryImportStore();
    const { batch, rows } = await createImportBatch(store, {
      ctx: MANAGER_CTX,
      workspaceId: MANAGER_CTX.workspaceId,
      filename: 'bad.csv',
      contentType: 'text/csv',
      content: 'product_name,price\n,1000\nOK Slip,abc\n',
    });
    expect(batch.status).toBe('draft');
    expect(batch.readyRows).toBe(0);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === 'draft')).toBe(true);
    expect(rows[0]?.errors).toContain('product_name is required');
  });

  it('is idempotent on idempotencyKey', async () => {
    const store = new InMemoryImportStore();
    const first = await createImportBatch(store, {
      ctx: MANAGER_CTX,
      workspaceId: MANAGER_CTX.workspaceId,
      filename: 'a.csv',
      contentType: 'text/csv',
      content: 'product_name,price\nKaos,1000\n',
      idempotencyKey: 'same-key',
    });
    const second = await createImportBatch(store, {
      ctx: MANAGER_CTX,
      workspaceId: MANAGER_CTX.workspaceId,
      filename: 'a.csv',
      contentType: 'text/csv',
      content: 'product_name,price\nKaos,1000\n',
      idempotencyKey: 'same-key',
    });
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.batch.id).toBe(first.batch.id);
    expect(second.rows).toHaveLength(1);
  });

  it('rejects binary mimes for CSV content and enforces RBAC', async () => {
    const store = new InMemoryImportStore();
    await expect(
      createImportBatch(store, {
        ctx: MANAGER_CTX,
        workspaceId: MANAGER_CTX.workspaceId,
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        content: 'not,csv',
      })
    ).rejects.toMatchObject({ code: 'IMPORT_VALIDATION' });
    await expect(
      createImportBatch(store, {
        ctx: STAFF_CTX,
        workspaceId: STAFF_CTX.workspaceId,
        filename: 'a.csv',
        contentType: 'text/csv',
        content: 'product_name,price\nKaos,1000\n',
      })
    ).rejects.toMatchObject({ code: 'TENANCY_FORBIDDEN' });
  });

  it('accepts pre-parsed rows for xlsx/photo/PDF converters', async () => {
    const store = new InMemoryImportStore();
    const { batch, rows } = await createImportBatch(store, {
      ctx: MANAGER_CTX,
      workspaceId: MANAGER_CTX.workspaceId,
      filename: 'scan.xlsx',
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      rows: [{ product_name: 'Sandal', harga: '25.000', sku_toko: 'SND-1' }],
    });
    expect(batch.status).toBe('review');
    expect(rows[0]?.sellingPriceCents).toBe(25000);
    expect(rows[0]?.sellerSkuHint).toBe('SND-1');
  });
});

describe('review (edit / reject / reopen)', () => {
  it('edits a draft row back to review and rejects rows', async () => {
    const store = new InMemoryImportStore();
    const { batch } = await createImportBatch(store, {
      ctx: MANAGER_CTX,
      workspaceId: MANAGER_CTX.workspaceId,
      filename: 'bad.csv',
      contentType: 'text/csv',
      content: 'product_name,price\n,1000\n',
    });
    const before = await getImportBatch(store, {
      ctx: MANAGER_CTX,
      workspaceId: MANAGER_CTX.workspaceId,
      batchId: batch.id,
    });
    const rowId = before.rows[0]?.id ?? '';
    const fixed = await updateImportRow(store, {
      ctx: MANAGER_CTX,
      workspaceId: MANAGER_CTX.workspaceId,
      batchId: batch.id,
      rowId,
      patch: { productName: 'Kaos Fixed' },
    });
    expect(fixed.status).toBe('review');
    expect(fixed.errors).toEqual([]);

    const rejected = await updateImportRow(store, {
      ctx: MANAGER_CTX,
      workspaceId: MANAGER_CTX.workspaceId,
      batchId: batch.id,
      rowId,
      patch: { status: 'rejected', note: 'duplicate scan' },
    });
    expect(rejected.status).toBe('rejected');

    const rejectedBatch = await rejectImportBatch(store, {
      ctx: ADMIN_CTX,
      workspaceId: ADMIN_CTX.workspaceId,
      batchId: batch.id,
    });
    expect(rejectedBatch.status).toBe('rejected');
    const reopened = await reopenImportBatch(store, {
      ctx: ADMIN_CTX,
      workspaceId: ADMIN_CTX.workspaceId,
      batchId: batch.id,
    });
    expect(reopened.status).toBe('draft');
  });
});

describe('confirmImportBatch (review/confirm)', () => {
  it('creates catalog products grouped by name with mapping candidates', async () => {
    const catalog = new InMemoryCatalogStore();
    const { store, batch } = await seedBatch();
    const result = await confirmImportBatch(store, catalog, {
      ctx: MANAGER_CTX,
      workspaceId: MANAGER_CTX.workspaceId,
      batchId: batch.id,
    });
    expect(result.applied).toHaveLength(3);
    expect(result.duplicates).toHaveLength(0);
    expect(result.batch.status).toBe('applied');

    // Two product names → two products (Kaos Polos holds 2 variants).
    const products = await listProducts(catalog, {
      ctx: MANAGER_CTX,
      workspaceId: MANAGER_CTX.workspaceId,
    });
    expect(products).toHaveLength(2);
    const kaos = products.find((p) => p.product.name === 'Kaos Polos');
    expect(kaos?.variants.map((v) => v.skuCode).sort()).toEqual([
      'KAOS-MERAH-M',
      'KAOS-PUTIH-L',
    ]);

    // Store SKU became a channel-mapping candidate on the variant.
    const merah = kaos?.variants.find((v) => v.skuCode === 'KAOS-MERAH-M');
    const mappings = await catalog.listMappingsByVariant(
      MANAGER_CTX.workspaceId,
      merah?.id ?? ''
    );
    expect(mappings).toHaveLength(1);
    expect(mappings[0]).toMatchObject({
      channel: 'shopee',
      shopExtId: 'shop_42',
      platformSkuId: 'SHOPEE-9001',
      sellerSkuHint: 'SELLER-KAOS-M',
    });
    // And the TokoBoss identity is untouched by the marketplace code.
    expect(merah?.skuCode).toBe('KAOS-MERAH-M');
  });

  it('surfaces duplicate SKUs with the existing path and never overwrites', async () => {
    const catalog = new InMemoryCatalogStore();
    const { store, batch } = await seedBatch();
    await confirmImportBatch(store, catalog, {
      ctx: MANAGER_CTX,
      workspaceId: MANAGER_CTX.workspaceId,
      batchId: batch.id,
    });

    const retry = await createImportBatch(store, {
      ctx: MANAGER_CTX,
      workspaceId: MANAGER_CTX.workspaceId,
      filename: 'produk.csv',
      contentType: 'text/csv',
      content: CSV,
    });
    const result = await confirmImportBatch(store, catalog, {
      ctx: MANAGER_CTX,
      workspaceId: MANAGER_CTX.workspaceId,
      batchId: retry.batch.id,
    });
    // Same SKUs (generated slugs embed row numbers, so Topi matches too).
    expect(result.applied).toHaveLength(0);
    expect(result.duplicates).toHaveLength(3);
    expect(result.duplicates[0]?.existingPath).toContain(
      `/api/workspaces/${MANAGER_CTX.workspaceId}/catalog/products/`
    );
    // Batch keeps its review state for the operator to triage.
    expect(result.batch.status).toBe('review');
    void store;
  });

  it('is idempotent across re-confirms', async () => {
    const catalog = new InMemoryCatalogStore();
    const { store, batch } = await seedBatch();
    await confirmImportBatch(store, catalog, {
      ctx: MANAGER_CTX,
      workspaceId: MANAGER_CTX.workspaceId,
      batchId: batch.id,
    });
    await expect(
      confirmImportBatch(store, catalog, {
        ctx: MANAGER_CTX,
        workspaceId: MANAGER_CTX.workspaceId,
        batchId: batch.id,
      })
    ).rejects.toMatchObject({ code: 'IMPORT_VALIDATION' });
    void store;
  });
});
