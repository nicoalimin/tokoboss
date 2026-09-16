/**
 * Product import infrastructure wiring for Route Handlers (UTA-77, Story 02).
 *
 * - Stores mirror `@/lib/catalog`: Postgres (`DATABASE_URL` set) through
 *   `DrizzleProductImportStore` (+ the shared catalog store for confirm),
 *   otherwise process-local in-memory stores (local-dev/fixture mode;
 *   responses include `storage: "memory"`).
 * - The synchronous parse links a `product-import` job row
 *   (queued → running → completed) via the shared job runner/store, so
 *   `/api/jobs/:id` timelines stay the observability surface. Job linkage
 *   is best-effort: a batch without a job row is still fully
 *   reviewable/confirmable.
 * - Authorization reuses the catalog member gates (same workspace
 *   membership model); the import use-cases re-assert every rule so the
 *   HTTP layer is never the only check.
 */
import {
  DrizzleProductImportStore,
  createDb,
  type DbHandle,
} from '@tokoboss/database';
import {
  InMemoryImportStore,
  type CatalogStore,
  type ImportBatchRecord,
  type ImportRowRecord,
  type JobStore,
  type JobTxRunner,
  type ProductImportStore,
} from '@tokoboss/application';
import type {
  ConfirmImportResultView,
  ImportBatchView,
  ImportRowView,
} from '@tokoboss/contracts';
import { getCatalogStore as getSharedCatalogStore } from '@/lib/catalog';
import { getJobStore, getJobTxRunner } from '@/lib/jobs';

export { storageKind } from '@/lib/auth';
export {
  catalogErrorStatus,
  requireManagerOrAdmin,
  requireWorkspaceMember,
  slideForMember,
} from '@/lib/catalog';

let dbHandle: DbHandle | null = null;
let memoryImports: InMemoryImportStore | null = null;

function getDbHandle(): DbHandle {
  if (!dbHandle) dbHandle = createDb(process.env['DATABASE_URL']);
  return dbHandle;
}

function getMemoryImports(): InMemoryImportStore {
  if (!memoryImports) memoryImports = new InMemoryImportStore();
  return memoryImports;
}

export function getImportStore(): ProductImportStore {
  if (process.env['DATABASE_URL']) {
    return new DrizzleProductImportStore(getDbHandle().db);
  }
  return getMemoryImports();
}

/** Catalog store for confirm (shared singletons per storage kind). */
export function getImportCatalogStore(): CatalogStore {
  return getSharedCatalogStore();
}

export function getImportJobs(): { runner: JobTxRunner; store: JobStore } {
  return { runner: getJobTxRunner(), store: getJobStore() };
}

/**
 * Reset process-local import state. Test seam for `web/src/__tests__`;
 * call alongside `__resetAuthForTests`. Refuses production.
 */
export function __resetImportsForTests(): void {
  if (
    process.env['APP_ENV'] === 'production' ||
    process.env['VERCEL_ENV'] === 'production'
  ) {
    throw new Error('Refusing fixture reset in production');
  }
  memoryImports = new InMemoryImportStore();
}

/**
 * Map application-layer import errors to HTTP status codes. Messages from
 * the use-cases are client-safe by design (opaque ids only), so they pass
 * through; unknown failures collapse to a generic 500.
 */
export function importErrorStatus(err: unknown): {
  status: number;
  errorCode: string;
} {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  switch (code) {
    case 'IMPORT_VALIDATION':
      return { status: 400, errorCode: 'IMPORT_VALIDATION' };
    case 'TENANCY_FORBIDDEN':
    case 'IMPORT_FORBIDDEN':
      return { status: 403, errorCode: 'TENANCY_FORBIDDEN' };
    case 'IMPORT_NOT_FOUND':
      return { status: 404, errorCode: 'IMPORT_NOT_FOUND' };
    case 'IMPORT_CONFLICT':
      return { status: 409, errorCode: 'IMPORT_CONFLICT' };
    default:
      return { status: 500, errorCode: 'IMPORT_FAILED' };
  }
}

function iso(date: Date): string {
  return date.toISOString();
}

export function toImportRowView(r: ImportRowRecord): ImportRowView {
  return {
    id: r.id,
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
    duplicateOf: r.duplicateOf
      ? {
          existingPath: r.duplicateOf.existingPath,
          existingVariantId: r.duplicateOf.existingVariantId,
          existingProductId: r.duplicateOf.existingProductId,
          source: r.duplicateOf.source,
        }
      : null,
    applied: r.applied
      ? { productId: r.applied.productId, variantId: r.applied.variantId }
      : null,
    note: r.note,
    createdAt: iso(r.createdAt),
    updatedAt: iso(r.updatedAt),
  };
}

export function toImportBatchView(
  batch: ImportBatchRecord,
  rows?: ImportRowRecord[]
): ImportBatchView {
  return {
    id: batch.id,
    workspaceId: batch.workspaceId,
    jobId: batch.jobId,
    sourceFilename: batch.sourceFilename,
    sourceMime: batch.sourceMime,
    sourceByteSize: batch.sourceByteSize,
    status: batch.status,
    totalRows: batch.totalRows,
    readyRows: batch.readyRows,
    appliedRows: batch.appliedRows,
    rejectedRows: batch.rejectedRows,
    createdAt: iso(batch.createdAt),
    updatedAt: iso(batch.updatedAt),
    ...(rows !== undefined ? { rows: rows.map(toImportRowView) } : {}),
  };
}

export function toConfirmView(result: {
  applied: Array<{ rowId: string; productId: string; variantId: string }>;
  duplicates: Array<{
    rowId: string;
    skuCode: string;
    existingPath: string;
    existingVariantId: string;
    existingProductId: string;
  }>;
  skipped: Array<{ rowId: string; reason: string }>;
  batch: ImportBatchRecord;
}): { summary: ConfirmImportResultView; batch: ImportBatchView } {
  return {
    summary: {
      applied: result.applied,
      duplicates: result.duplicates,
      skipped: result.skipped,
    },
    batch: toImportBatchView(result.batch),
  };
}
