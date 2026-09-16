import { importNotFound } from './import-errors';
import type { ProductImportStore } from './import-ports';
import type { ImportBatchRecord, ImportRowRecord } from './import-types';

function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((v) => clone(v)) as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = clone(v);
    }
    return out as T;
  }
  return value;
}

/**
 * In-memory `ProductImportStore` for unit tests and memory-mode web wiring.
 * Enforces the same contracts as Postgres: workspace scoping and
 * `(workspace, idempotency_key)` batch uniqueness.
 */
export class InMemoryImportStore implements ProductImportStore {
  private batches = new Map<string, ImportBatchRecord>();
  private rows = new Map<string, ImportRowRecord>();
  private batchKeyIndex = new Map<string, string>();
  private seq = 0;

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq.toString().padStart(4, '0')}`;
  }

  async createBatch(input: {
    workspaceId: string;
    jobId: string | null;
    sourceFilename: string;
    sourceMime: string;
    sourceByteSize: number;
    status: ImportBatchRecord['status'];
    totalRows: number;
    readyRows: number;
    appliedRows: number;
    rejectedRows: number;
    idempotencyKey: string;
    createdById: string | null;
  }): Promise<ImportBatchRecord> {
    const key = `${input.workspaceId}::${input.idempotencyKey}`;
    const clashId = this.batchKeyIndex.get(key);
    if (clashId) {
      const clash = this.batches.get(clashId);
      if (clash) {
        const err = new Error(
          `Import batch already exists for idempotency key ${input.idempotencyKey}`
        );
        err.name = 'ImportConflictError';
        (err as Error & { code: string }).code = 'IMPORT_CONFLICT';
        throw err;
      }
    }
    const now = new Date();
    const record: ImportBatchRecord = {
      id: this.nextId('imp'),
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.batches.set(record.id, record);
    this.batchKeyIndex.set(key, record.id);
    return clone(record);
  }

  async findBatchById(
    workspaceId: string,
    batchId: string
  ): Promise<ImportBatchRecord | null> {
    const record = this.batches.get(batchId);
    if (!record || record.workspaceId !== workspaceId) return null;
    return clone(record);
  }

  async findBatchByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string
  ): Promise<ImportBatchRecord | null> {
    const id = this.batchKeyIndex.get(`${workspaceId}::${idempotencyKey}`);
    if (!id) return null;
    const record = this.batches.get(id);
    return record ? clone(record) : null;
  }

  async listBatches(
    workspaceId: string,
    limit: number
  ): Promise<ImportBatchRecord[]> {
    const out: ImportBatchRecord[] = [];
    for (const b of this.batches.values()) {
      if (b.workspaceId === workspaceId) out.push(clone(b));
    }
    out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return out.slice(0, Math.max(1, limit));
  }

  async updateBatch(
    workspaceId: string,
    batchId: string,
    patch: {
      jobId?: string | null;
      status?: ImportBatchRecord['status'];
      readyRows?: number;
      appliedRows?: number;
      rejectedRows?: number;
    }
  ): Promise<ImportBatchRecord> {
    const record = this.batches.get(batchId);
    if (!record || record.workspaceId !== workspaceId) {
      throw importNotFound('Import batch');
    }
    const updated: ImportBatchRecord = {
      ...clone(record),
      ...(patch.jobId !== undefined ? { jobId: patch.jobId } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.readyRows !== undefined ? { readyRows: patch.readyRows } : {}),
      ...(patch.appliedRows !== undefined
        ? { appliedRows: patch.appliedRows }
        : {}),
      ...(patch.rejectedRows !== undefined
        ? { rejectedRows: patch.rejectedRows }
        : {}),
      updatedAt: new Date(),
    };
    this.batches.set(batchId, updated);
    return clone(updated);
  }

  async createRows(
    rows: Array<{
      workspaceId: string;
      batchId: string;
      rowNumber: number;
      status: ImportRowRecord['status'];
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
    const now = new Date();
    const created: ImportRowRecord[] = rows.map((r) => ({
      id: this.nextId('imr'),
      ...clone(r),
      createdAt: now,
      updatedAt: now,
    }));
    for (const c of created) this.rows.set(c.id, c);
    return clone(created);
  }

  async listRowsByBatch(
    workspaceId: string,
    batchId: string
  ): Promise<ImportRowRecord[]> {
    const out: ImportRowRecord[] = [];
    for (const r of this.rows.values()) {
      if (r.workspaceId === workspaceId && r.batchId === batchId) {
        out.push(clone(r));
      }
    }
    out.sort((a, b) => a.rowNumber - b.rowNumber);
    return out;
  }

  async findRowById(
    workspaceId: string,
    rowId: string
  ): Promise<ImportRowRecord | null> {
    const record = this.rows.get(rowId);
    if (!record || record.workspaceId !== workspaceId) return null;
    return clone(record);
  }

  async updateRow(
    workspaceId: string,
    rowId: string,
    patch: {
      status?: ImportRowRecord['status'];
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
    const record = this.rows.get(rowId);
    if (!record || record.workspaceId !== workspaceId) {
      throw importNotFound('Import row');
    }
    const updated: ImportRowRecord = {
      ...clone(record),
      ...clone(patch),
      updatedAt: new Date(),
    };
    this.rows.set(rowId, updated);
    return clone(updated);
  }
}
