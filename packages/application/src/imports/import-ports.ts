import type {
  ImportBatchRecord,
  ImportBatchStatus,
  ImportRowRecord,
  ImportRowStatus,
} from './import-types';

/**
 * Persistence port for unstructured product imports (UTA-77, Story 02).
 *
 * Implementations:
 * - `DrizzleProductImportStore` (`@tokoboss/database`) — Postgres/Neon.
 * - `InMemoryImportStore` (here) — unit tests and memory-mode web wiring.
 *
 * Every method is workspace-scoped: the `workspaceId` argument is the
 * isolation boundary and cross-workspace misses surface as null (use-cases
 * map them to `importNotFound`, indistinguishable from not-found).
 */
export interface ProductImportStore {
  createBatch(input: {
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
  }): Promise<ImportBatchRecord>;

  findBatchById(
    workspaceId: string,
    batchId: string
  ): Promise<ImportBatchRecord | null>;

  findBatchByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string
  ): Promise<ImportBatchRecord | null>;

  listBatches(workspaceId: string, limit: number): Promise<ImportBatchRecord[]>;

  updateBatch(
    workspaceId: string,
    batchId: string,
    patch: {
      jobId?: string | null;
      status?: ImportBatchStatus;
      readyRows?: number;
      appliedRows?: number;
      rejectedRows?: number;
    }
  ): Promise<ImportBatchRecord>;

  createRows(
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
  ): Promise<ImportRowRecord[]>;

  listRowsByBatch(
    workspaceId: string,
    batchId: string
  ): Promise<ImportRowRecord[]>;

  findRowById(
    workspaceId: string,
    rowId: string
  ): Promise<ImportRowRecord | null>;

  updateRow(
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
  ): Promise<ImportRowRecord>;
}
