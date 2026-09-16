import {
  importNotFound,
  isImportBatchStatus,
  isImportRowStatus,
} from '@tokoboss/application';
import type {
  ImportBatchRecord,
  ImportBatchStatus,
  ImportRowRecord,
  ImportRowStatus,
  ProductImportStore,
} from '@tokoboss/application';
import { and, desc, eq } from 'drizzle-orm';
import type { DatabaseHandle, Transaction } from '../db';
import { productImportBatches, productImportRows } from '../schema/index';
import type {
  ProductImportBatchRow,
  ProductImportRowRow,
} from '../schema/index';

type DbOrTx = Transaction | DatabaseHandle;

function toBatch(row: ProductImportBatchRow): ImportBatchRecord {
  if (!isImportBatchStatus(row.status)) {
    throw new Error(`IMPORT_CORRUPT: unknown batch status ${row.status}`);
  }
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    jobId: row.jobId,
    sourceFilename: row.sourceFilename,
    sourceMime: row.sourceMime,
    sourceByteSize: row.sourceByteSize,
    status: row.status,
    totalRows: row.totalRows,
    readyRows: row.readyRows,
    appliedRows: row.appliedRows,
    rejectedRows: row.rejectedRows,
    idempotencyKey: row.idempotencyKey,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toRow(row: ProductImportRowRow): ImportRowRecord {
  if (!isImportRowStatus(row.status)) {
    throw new Error(`IMPORT_CORRUPT: unknown row status ${row.status}`);
  }
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    batchId: row.batchId,
    rowNumber: row.rowNumber,
    status: row.status,
    productName: row.productName,
    skuCode: row.skuCode,
    variantName: row.variantName,
    barcode: row.barcode,
    sellingPriceCents: row.sellingPriceCents,
    currency: row.currency,
    hppCents: row.hppCents,
    costSource: row.costSource,
    listingName: row.listingName,
    unit: row.unit,
    channel: row.channel,
    shopExtId: row.shopExtId,
    platformSkuId: row.platformSkuId,
    sellerSkuHint: row.sellerSkuHint,
    errors: row.errors ?? [],
    duplicateOf: row.duplicateOf ?? null,
    applied: row.applied ?? null,
    note: row.note,
    raw: row.raw ?? {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const top = (err as { code?: unknown }).code;
  if (top === '23505') return true;
  const cause = (err as { cause?: unknown }).cause;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    (cause as { code?: unknown }).code === '23505'
  );
}

function conflictError(key: string): Error & { code: string } {
  const err = new Error(
    `Import batch already exists for idempotency key ${key}`
  );
  err.name = 'ImportConflictError';
  (err as Error & { code: string }).code = 'IMPORT_CONFLICT';
  return err as Error & { code: string };
}

/**
 * Postgres-backed `ProductImportStore` (Neon via `createDb`, PGlite in
 * tests). Workspace scoping on every query; duplicate
 * `(workspace, idempotency_key)` batch creates surface `IMPORT_CONFLICT`
 * so the use-case can resolve to the winner (no double-parsed batches).
 */
export class DrizzleProductImportStore implements ProductImportStore {
  constructor(private readonly db: DbOrTx) {}

  withTransaction(tx: DbOrTx): DrizzleProductImportStore {
    return new DrizzleProductImportStore(tx);
  }

  async createBatch(input: {
    workspaceId: string;
    jobId: string | null;
    sourceFilename: string;
    sourceMime: string;
    sourceByteSize: number;
    status: ImportBatchStatus;
    totalRows: number;
    readyRows: number;
    appliedRows: number;
    rejectedRows: number;
    idempotencyKey: string;
    createdById: string | null;
  }): Promise<ImportBatchRecord> {
    try {
      const inserted = await this.db
        .insert(productImportBatches)
        .values({
          workspaceId: input.workspaceId,
          jobId: input.jobId,
          sourceFilename: input.sourceFilename,
          sourceMime: input.sourceMime,
          sourceByteSize: input.sourceByteSize,
          status: input.status,
          totalRows: input.totalRows,
          readyRows: input.readyRows,
          appliedRows: input.appliedRows,
          rejectedRows: input.rejectedRows,
          idempotencyKey: input.idempotencyKey,
          createdById: input.createdById,
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error('Failed to insert import batch');
      return toBatch(row);
    } catch (err) {
      if (isUniqueViolation(err)) throw conflictError(input.idempotencyKey);
      throw err;
    }
  }

  async findBatchById(
    workspaceId: string,
    batchId: string
  ): Promise<ImportBatchRecord | null> {
    const rows = await this.db
      .select()
      .from(productImportBatches)
      .where(
        and(
          eq(productImportBatches.id, batchId),
          eq(productImportBatches.workspaceId, workspaceId)
        )
      )
      .limit(1);
    const row = rows[0];
    return row ? toBatch(row) : null;
  }

  async findBatchByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string
  ): Promise<ImportBatchRecord | null> {
    const rows = await this.db
      .select()
      .from(productImportBatches)
      .where(
        and(
          eq(productImportBatches.workspaceId, workspaceId),
          eq(productImportBatches.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1);
    const row = rows[0];
    return row ? toBatch(row) : null;
  }

  async listBatches(
    workspaceId: string,
    limit: number
  ): Promise<ImportBatchRecord[]> {
    const rows = await this.db
      .select()
      .from(productImportBatches)
      .where(eq(productImportBatches.workspaceId, workspaceId))
      .orderBy(desc(productImportBatches.createdAt))
      .limit(Math.max(1, limit));
    return rows.map(toBatch);
  }

  async updateBatch(
    workspaceId: string,
    batchId: string,
    patch: {
      jobId?: string | null;
      status?: ImportBatchStatus;
      readyRows?: number;
      appliedRows?: number;
      rejectedRows?: number;
    }
  ): Promise<ImportBatchRecord> {
    const updated = await this.db
      .update(productImportBatches)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(productImportBatches.id, batchId),
          eq(productImportBatches.workspaceId, workspaceId)
        )
      )
      .returning();
    const row = updated[0];
    if (!row) throw importNotFound('Import batch');
    return toBatch(row);
  }

  async createRows(
    rows: Array<{
      workspaceId: string;
      batchId: string;
      rowNumber: number;
      status: ImportRowStatus;
      productName: string;
      skuCode: string;
      variantName: string | null;
      barcode: string | null;
      sellingPriceCents: number;
      currency: string;
      hppCents: number | null;
      costSource: string | null;
      listingName: string | null;
      unit: string;
      channel: string | null;
      shopExtId: string | null;
      platformSkuId: string | null;
      sellerSkuHint: string | null;
      errors: string[];
      duplicateOf: ImportRowRecord['duplicateOf'];
      applied: ImportRowRecord['applied'];
      note: string | null;
      raw: Record<string, unknown>;
    }>
  ): Promise<ImportRowRecord[]> {
    if (rows.length === 0) return [];
    const inserted = await this.db
      .insert(productImportRows)
      .values(
        rows.map((r) => ({
          workspaceId: r.workspaceId,
          batchId: r.batchId,
          rowNumber: r.rowNumber,
          status: r.status,
          productName: r.productName,
          skuCode: r.skuCode,
          variantName: r.variantName,
          barcode: r.barcode,
          sellingPriceCents: r.sellingPriceCents,
          currency: r.currency,
          hppCents: r.hppCents,
          costSource: r.costSource,
          listingName: r.listingName,
          unit: r.unit,
          channel: r.channel,
          shopExtId: r.shopExtId,
          platformSkuId: r.platformSkuId,
          sellerSkuHint: r.sellerSkuHint,
          errors: r.errors,
          duplicateOf: r.duplicateOf,
          applied: r.applied,
          note: r.note,
          raw: r.raw,
        }))
      )
      .returning();
    return inserted.map(toRow);
  }

  async listRowsByBatch(
    workspaceId: string,
    batchId: string
  ): Promise<ImportRowRecord[]> {
    const rows = await this.db
      .select()
      .from(productImportRows)
      .where(
        and(
          eq(productImportRows.workspaceId, workspaceId),
          eq(productImportRows.batchId, batchId)
        )
      )
      .orderBy(productImportRows.rowNumber);
    return rows.map(toRow);
  }

  async findRowById(
    workspaceId: string,
    rowId: string
  ): Promise<ImportRowRecord | null> {
    const rows = await this.db
      .select()
      .from(productImportRows)
      .where(
        and(
          eq(productImportRows.id, rowId),
          eq(productImportRows.workspaceId, workspaceId)
        )
      )
      .limit(1);
    const row = rows[0];
    return row ? toRow(row) : null;
  }

  async updateRow(
    workspaceId: string,
    rowId: string,
    patch: {
      status?: ImportRowStatus;
      productName?: string;
      skuCode?: string;
      variantName?: string | null;
      barcode?: string | null;
      sellingPriceCents?: number;
      currency?: string;
      hppCents?: number | null;
      costSource?: string | null;
      listingName?: string | null;
      unit?: string;
      channel?: string | null;
      shopExtId?: string | null;
      platformSkuId?: string | null;
      sellerSkuHint?: string | null;
      errors?: string[];
      duplicateOf?: ImportRowRecord['duplicateOf'];
      applied?: ImportRowRecord['applied'];
      note?: string | null;
    }
  ): Promise<ImportRowRecord> {
    const updated = await this.db
      .update(productImportRows)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(
          eq(productImportRows.id, rowId),
          eq(productImportRows.workspaceId, workspaceId)
        )
      )
      .returning();
    const row = updated[0];
    if (!row) throw importNotFound('Import row');
    return toRow(row);
  }
}
