import { SkuCode } from '@tokoboss/domain';
import type { CatalogStore } from '../catalog/catalog-ports';
import { createMapping, createProduct } from '../catalog/catalog-use-cases';
import type { JobStore, JobTxRunner } from '../jobs/job-ports';
import { claimStartJob, completeJob, createJob } from '../jobs/job-use-cases';
import type { WorkspaceContext } from '../tenancy/tenancy-types';
import {
  assertManagerOrAdmin,
  assertSameWorkspace,
} from '../tenancy/workspace-context';
import {
  generateImportSku,
  IMPORT_MAX_CONTENT_CHARS,
  IMPORT_MAX_ROWS,
  normaliseImportRow,
  parseImportCsv,
  parseImportRows,
} from './import-csv';
import {
  importConflict,
  importNotFound,
  importValidation,
} from './import-errors';
import type { ProductImportStore } from './import-ports';
import type {
  ImportBatchRecord,
  ImportDuplicateRef,
  ImportRowRecord,
  ParsedImportRow,
} from './import-types';

/**
 * Unstructured product import use-cases (UTA-77, Story 02).
 *
 * Pipeline: upload (CSV text or pre-parsed rows) → parse into reviewable
 * row candidates → human review (edit/reject rows) → confirm-before-create
 * into the catalog via the UTA-75 use-cases.
 *
 * Every use-case takes the path `workspaceId` explicitly and asserts it
 * against the server-resolved `ctx` (never trusts client claims).
 * RBAC: reads need active membership; batch/row writes + confirm need
 * Manager/Admin. Confirm never overwrites: duplicate SKU TokoBoss codes
 * mark the row rejected with a path to the existing row.
 */

export const PRODUCT_IMPORT_JOB_TYPE = 'product-import';

const CSV_MIMES = new Set([
  'text/csv',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel',
]);

function cleanFilename(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw importValidation('filename must not be empty');
  }
  const name = value.trim().slice(0, 200);
  if (name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw importValidation('filename must be a plain file name');
  }
  return name;
}

function cleanMime(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw importValidation('contentType must not be empty');
  }
  return value.trim().toLowerCase().slice(0, 120);
}

function toBatchPath(workspaceId: string, batchId: string): string {
  return `/api/workspaces/${workspaceId}/imports/${batchId}`;
}

/**
 * Resolve `__GENERATED__` placeholders into server-generated SKU TokoBoss
 * slugs. Explicit codes pass through untouched — within-batch collisions
 * are NOT renamed here; confirm marks the later rows as batch-duplicates
 * (with a pointer to the winning row) instead of minting near-duplicate
 * identities.
 */
function assignSkus(parsed: ParsedImportRow[]): string[] {
  return parsed.map((row) =>
    row.skuCode && row.skuCode !== '__GENERATED__'
      ? row.skuCode
      : generateImportSku(
          row.productName || 'PRODUCT',
          row.variantName,
          row.rowNumber
        )
  );
}

export interface CreateImportBatchInput {
  ctx: WorkspaceContext;
  workspaceId: string;
  filename: unknown;
  contentType: unknown;
  /** Raw CSV text (the MVP upload shape). */
  content?: unknown;
  /** Pre-parsed rows (xlsx/photo/PDF converter output). */
  rows?: unknown;
  idempotencyKey?: unknown;
}

export interface CreateImportBatchResult {
  batch: ImportBatchRecord;
  rows: ImportRowRecord[];
  duplicate: boolean;
  /** Linked `product-import` job id (null when no job runner supplied). */
  jobId: string | null;
}

/**
 * Upload + parse (step 2): CSV text or pre-parsed rows become a reviewable
 * batch. Idempotent on `(workspace, idempotencyKey)` — a retry resolves to
 * the existing batch with `duplicate: true` instead of double-parsing.
 *
 * Binary-first formats (xlsx/photo/PDF) are NOT parsed server-side: callers
 * convert them to `rows` first (see runbook). A CSV `content` with a binary
 * mime is rejected with a client-safe 415-style validation error.
 */
export async function createImportBatch(
  store: ProductImportStore,
  input: CreateImportBatchInput,
  jobs?: { runner: JobTxRunner; store: JobStore }
): Promise<CreateImportBatchResult> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  assertManagerOrAdmin(input.ctx);
  const workspaceId = input.workspaceId;
  const filename = cleanFilename(input.filename);
  const mime = cleanMime(input.contentType);

  let parsed: ParsedImportRow[];
  let byteSize: number;
  if (input.rows !== undefined) {
    if (!Array.isArray(input.rows) || input.rows.length === 0) {
      throw importValidation('rows must be a non-empty array');
    }
    if (input.rows.length > IMPORT_MAX_ROWS) {
      throw importValidation(
        `rows exceeds the limit of ${IMPORT_MAX_ROWS} per batch`
      );
    }
    const rawRows = input.rows.map((r) => {
      if (typeof r !== 'object' || r === null || Array.isArray(r)) {
        throw importValidation('each row must be an object');
      }
      return r as Record<string, unknown>;
    });
    parsed = parseImportRows(rawRows);
    byteSize = Buffer.byteLength(JSON.stringify(rawRows), 'utf8');
  } else if (typeof input.content === 'string') {
    if (!CSV_MIMES.has(mime) && !mime.startsWith('text/')) {
      throw importValidation(
        `contentType ${JSON.stringify(mime)} is not parseable as CSV; ` +
          `submit xlsx/photo/PDF as pre-parsed rows instead`
      );
    }
    if (input.content.length === 0) {
      throw importValidation('content must not be empty');
    }
    if (input.content.length > IMPORT_MAX_CONTENT_CHARS) {
      throw importValidation(
        `content exceeds the limit of ${IMPORT_MAX_CONTENT_CHARS} characters`
      );
    }
    parsed = parseImportCsv(input.content);
    byteSize = Buffer.byteLength(input.content, 'utf8');
    if (parsed.length === 0) {
      throw importValidation('no data rows found in content');
    }
    if (parsed.length > IMPORT_MAX_ROWS) {
      throw importValidation(
        `content exceeds the limit of ${IMPORT_MAX_ROWS} rows per batch`
      );
    }
  } else {
    throw importValidation('either content (CSV) or rows is required');
  }

  const idempotencyKey =
    typeof input.idempotencyKey === 'string' &&
    input.idempotencyKey.trim().length > 0
      ? input.idempotencyKey.trim().slice(0, 128)
      : `imp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  const existing = await store.findBatchByIdempotencyKey(
    workspaceId,
    idempotencyKey
  );
  if (existing) {
    const rows = await store.listRowsByBatch(workspaceId, existing.id);
    return { batch: existing, rows, duplicate: true, jobId: existing.jobId };
  }

  const skuByIndex = assignSkus(parsed);
  const rowsToCreate = parsed.map((row, idx) => {
    const ready =
      row.errors.length === 0 &&
      row.productName.length > 0 &&
      row.sellingPriceCents !== null;
    return {
      workspaceId,
      batchId: '', // filled after the batch row exists
      rowNumber: row.rowNumber,
      status: ready ? ('review' as const) : ('draft' as const),
      productName: row.productName,
      skuCode: skuByIndex[idx] ?? '',
      variantName: row.variantName,
      barcode: row.barcode,
      sellingPriceCents: row.sellingPriceCents ?? 0,
      currency: row.currency,
      hppCents: row.hppCents,
      costSource: row.costSource,
      listingName: row.listingName,
      unit: row.unit,
      channel: row.channel,
      shopExtId: row.shopExtId,
      platformSkuId: row.platformSkuId,
      sellerSkuHint: row.sellerSkuHint,
      errors: ready ? [] : row.errors,
      duplicateOf: null,
      applied: null,
      note: null,
      raw: row.raw,
    };
  });
  const readyRows = rowsToCreate.filter((r) => r.status === 'review').length;

  let batch: ImportBatchRecord;
  try {
    batch = await store.createBatch({
      workspaceId,
      jobId: null,
      sourceFilename: filename,
      sourceMime: mime,
      sourceByteSize: byteSize,
      status: readyRows > 0 ? 'review' : 'draft',
      totalRows: rowsToCreate.length,
      readyRows,
      appliedRows: 0,
      rejectedRows: 0,
      idempotencyKey,
      createdById: input.ctx.userId,
    });
  } catch (err) {
    if (
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: unknown }).code === 'IMPORT_CONFLICT'
    ) {
      const winner = await store.findBatchByIdempotencyKey(
        workspaceId,
        idempotencyKey
      );
      if (winner) {
        const rows = await store.listRowsByBatch(workspaceId, winner.id);
        return {
          batch: winner,
          rows,
          duplicate: true,
          jobId: winner.jobId,
        };
      }
    }
    throw err;
  }

  const rows = await store.createRows(
    rowsToCreate.map((r) => ({ ...r, batchId: batch.id }))
  );

  // Reuse jobs/job_events where sensible (step 1): the synchronous parse
  // completes immediately, so the `product-import` job moves
  // queued → running → completed in one pass with the batch as its
  // output ref.
  let jobId: string | null = null;
  if (jobs) {
    try {
      const { job } = await createJob(jobs.runner, {
        workspaceId,
        type: PRODUCT_IMPORT_JOB_TYPE,
        idempotencyKey: `import:${idempotencyKey}`,
        actorType: 'user',
        actorId: input.ctx.userId,
        inputRef: {
          batchId: batch.id,
          filename,
          totalRows: rows.length,
        },
      });
      const started = await claimStartJob(jobs.store, {
        jobId: job.id,
        workspaceId,
        workflowRunId: `local:${job.id}`,
      });
      const completed = await completeJob(jobs.store, {
        jobId: started.job.id,
        workspaceId,
        outputRef: {
          batchId: batch.id,
          batchPath: toBatchPath(workspaceId, batch.id),
          totalRows: rows.length,
          readyRows,
        },
      });
      jobId = completed.id;
      batch = await store.updateBatch(workspaceId, batch.id, { jobId });
    } catch {
      // Job linkage is observability, never load-bearing: a batch without
      // a job row stays fully reviewable/confirmable.
      jobId = null;
    }
  }

  return { batch, rows, duplicate: false, jobId };
}

export async function listImportBatches(
  store: ProductImportStore,
  input: { ctx: WorkspaceContext; workspaceId: string; limit?: number }
): Promise<ImportBatchRecord[]> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  return store.listBatches(input.workspaceId, limit);
}

export interface ImportBatchDetail {
  batch: ImportBatchRecord;
  rows: ImportRowRecord[];
}

export async function getImportBatch(
  store: ProductImportStore,
  input: { ctx: WorkspaceContext; workspaceId: string; batchId: string }
): Promise<ImportBatchDetail> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  const batch = await store.findBatchById(input.workspaceId, input.batchId);
  if (!batch) throw importNotFound('Import batch');
  const rows = await store.listRowsByBatch(input.workspaceId, batch.id);
  return { batch, rows };
}

export interface PatchImportRowInput {
  ctx: WorkspaceContext;
  workspaceId: string;
  batchId: string;
  rowId: string;
  /** Field edits (re-validated); or `{ status: 'rejected' }` to reject. */
  patch: {
    productName?: unknown;
    skuCode?: unknown;
    variantName?: unknown;
    barcode?: unknown;
    sellingPriceCents?: unknown;
    currency?: unknown;
    hppCents?: unknown;
    costSource?: unknown;
    listingName?: unknown;
    unit?: unknown;
    channel?: unknown;
    shopExtId?: unknown;
    platformSkuId?: unknown;
    sellerSkuHint?: unknown;
    status?: unknown;
    note?: unknown;
  };
}

/** Review edit / reject for one candidate row (Manager/Admin). */
export async function updateImportRow(
  store: ProductImportStore,
  input: PatchImportRowInput
): Promise<ImportRowRecord> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  assertManagerOrAdmin(input.ctx);
  const batch = await store.findBatchById(input.workspaceId, input.batchId);
  if (!batch) throw importNotFound('Import batch');
  if (batch.status !== 'draft' && batch.status !== 'review') {
    throw importValidation(
      `Batch is ${batch.status}; only draft/review batches are editable`
    );
  }
  const row = await store.findRowById(input.workspaceId, input.rowId);
  if (!row || row.batchId !== batch.id) throw importNotFound('Import row');
  if (row.status === 'applied') {
    throw importValidation('Applied rows cannot be edited');
  }

  if (input.patch.status === 'rejected') {
    const updated = await store.updateRow(input.workspaceId, row.id, {
      status: 'rejected',
      note:
        typeof input.patch.note === 'string'
          ? input.patch.note.trim().slice(0, 500) || null
          : row.note,
    });
    await refreshBatchCounts(store, input.workspaceId, batch.id);
    return updated;
  }
  if (input.patch.status !== undefined) {
    throw importValidation("status may only transition to 'rejected'");
  }

  // Merge edits over the stored candidate, then re-validate the whole row
  // through the same normaliser as the upload path.
  const merged: Record<string, unknown> = {
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
  };
  for (const [key, value] of Object.entries(input.patch)) {
    if (key === 'note') continue;
    merged[key] = value;
  }
  const normalised = normaliseImportRow(merged, row.rowNumber);
  const sku =
    normalised.skuCode && normalised.skuCode !== '__GENERATED__'
      ? normalised.skuCode
      : row.skuCode;
  try {
    SkuCode.parse(sku);
  } catch (err) {
    normalised.errors.push(
      err instanceof Error ? err.message : 'SKU code is invalid'
    );
  }
  const ready =
    normalised.errors.length === 0 &&
    normalised.productName.length > 0 &&
    normalised.sellingPriceCents !== null;
  const updated = await store.updateRow(input.workspaceId, row.id, {
    status: ready ? 'review' : 'draft',
    productName: normalised.productName,
    skuCode: sku,
    variantName: normalised.variantName,
    barcode: normalised.barcode,
    sellingPriceCents: normalised.sellingPriceCents ?? row.sellingPriceCents,
    currency: normalised.currency,
    hppCents: normalised.hppCents,
    costSource: normalised.costSource,
    listingName: normalised.listingName,
    unit: normalised.unit,
    channel: normalised.channel,
    shopExtId: normalised.shopExtId,
    platformSkuId: normalised.platformSkuId,
    sellerSkuHint: normalised.sellerSkuHint,
    errors: normalised.errors,
    duplicateOf: null,
    note:
      typeof input.patch.note === 'string'
        ? input.patch.note.trim().slice(0, 500) || null
        : row.note,
  });
  await refreshBatchCounts(store, input.workspaceId, batch.id);
  return updated;
}

export async function rejectImportBatch(
  store: ProductImportStore,
  input: { ctx: WorkspaceContext; workspaceId: string; batchId: string }
): Promise<ImportBatchRecord> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  assertManagerOrAdmin(input.ctx);
  const batch = await store.findBatchById(input.workspaceId, input.batchId);
  if (!batch) throw importNotFound('Import batch');
  if (batch.status !== 'draft' && batch.status !== 'review') {
    throw importValidation(`Batch is ${batch.status}; nothing to reject`);
  }
  return store.updateBatch(input.workspaceId, batch.id, { status: 'rejected' });
}

export async function reopenImportBatch(
  store: ProductImportStore,
  input: { ctx: WorkspaceContext; workspaceId: string; batchId: string }
): Promise<ImportBatchRecord> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  assertManagerOrAdmin(input.ctx);
  const batch = await store.findBatchById(input.workspaceId, input.batchId);
  if (!batch) throw importNotFound('Import batch');
  if (batch.status !== 'rejected') {
    throw importValidation(`Batch is ${batch.status}; only rejected reopens`);
  }
  const rows = await store.listRowsByBatch(input.workspaceId, batch.id);
  const ready = rows.filter((r) => r.status === 'review').length;
  return store.updateBatch(input.workspaceId, batch.id, {
    status: ready > 0 ? 'review' : 'draft',
  });
}

async function refreshBatchCounts(
  store: ProductImportStore,
  workspaceId: string,
  batchId: string
): Promise<ImportBatchRecord> {
  const rows = await store.listRowsByBatch(workspaceId, batchId);
  const ready = rows.filter((r) => r.status === 'review').length;
  const applied = rows.filter((r) => r.status === 'applied').length;
  const rejected = rows.filter((r) => r.status === 'rejected').length;
  const batch = await store.findBatchById(workspaceId, batchId);
  if (!batch) throw importNotFound('Import batch');
  let status = batch.status;
  if (status === 'draft' || status === 'review') {
    if (applied > 0 && ready === 0) status = 'applied';
    // Rejected rows are terminal triage, not drafts: keep the batch
    // reviewable so the operator can still edit remaining rows or reject
    // the batch explicitly.
    else status = ready > 0 || rejected > 0 ? 'review' : 'draft';
  }
  return store.updateBatch(workspaceId, batchId, {
    status,
    readyRows: ready,
    appliedRows: applied,
    rejectedRows: rejected,
  });
}

export interface ConfirmImportResult {
  batch: ImportBatchRecord;
  applied: Array<{ rowId: string; productId: string; variantId: string }>;
  duplicates: Array<{
    rowId: string;
    skuCode: string;
    existingPath: string;
    existingVariantId: string;
    existingProductId: string;
  }>;
  skipped: Array<{ rowId: string; reason: string }>;
}

/**
 * Review/confirm (step 3): apply creates Product/SKU TokoBoss rows via the
 * catalog use-cases — duplicate SKU codes surface the existing path and
 * mark the row rejected instead of overwriting. Marketplace Store SKU text
 * is written to `catalog_channel_mappings` as a candidate (no live channel
 * calls). Idempotent: re-confirming skips already-applied rows.
 */
export async function confirmImportBatch(
  imports: ProductImportStore,
  catalog: CatalogStore,
  input: {
    ctx: WorkspaceContext;
    workspaceId: string;
    batchId: string;
    /** Confirm a subset; default is every `review` row. */
    rowIds?: string[];
  }
): Promise<ConfirmImportResult> {
  assertSameWorkspace(input.ctx, input.workspaceId);
  assertManagerOrAdmin(input.ctx);
  const workspaceId = input.workspaceId;
  const batch = await imports.findBatchById(workspaceId, input.batchId);
  if (!batch) throw importNotFound('Import batch');
  if (batch.status !== 'draft' && batch.status !== 'review') {
    throw importValidation(`Batch is ${batch.status}; nothing to confirm`);
  }
  const allRows = await imports.listRowsByBatch(workspaceId, batch.id);
  const wanted = input.rowIds ? new Set(input.rowIds) : null;
  const candidates = allRows.filter((r) => {
    if (wanted && !wanted.has(r.id)) return false;
    return r.status === 'review' && r.errors.length === 0;
  });
  const skipped: ConfirmImportResult['skipped'] = [];
  for (const row of allRows) {
    if (wanted && !wanted.has(row.id)) continue;
    if (row.status === 'applied') {
      skipped.push({ rowId: row.id, reason: 'already applied' });
    } else if (row.status === 'rejected') {
      skipped.push({ rowId: row.id, reason: 'rejected in review' });
    } else if (row.status === 'draft' || row.errors.length > 0) {
      skipped.push({ rowId: row.id, reason: 'needs review fixes' });
    }
  }
  if (wanted) {
    for (const id of wanted) {
      if (!allRows.some((r) => r.id === id)) {
        throw importNotFound('Import row');
      }
    }
  }

  const applied: ConfirmImportResult['applied'] = [];
  const duplicates: ConfirmImportResult['duplicates'] = [];

  // Pre-check every candidate SKU against the catalog so duplicates surface
  // the existing path WITHOUT partial product creation. Rows sharing a
  // SKU inside the batch: first row wins, the rest are batch-duplicates.
  const seenInBatch = new Map<string, string>();
  const actionable: ImportRowRecord[] = [];
  for (const row of candidates) {
    const firstId = seenInBatch.get(row.skuCode);
    if (firstId !== undefined) {
      const duplicateOf: ImportDuplicateRef = {
        existingPath: `${toBatchPath(workspaceId, batch.id)}#row-${firstId}`,
        existingVariantId: '',
        existingProductId: '',
        source: 'batch',
      };
      await imports.updateRow(workspaceId, row.id, {
        status: 'rejected',
        duplicateOf,
        note: `Duplicate SKU ${row.skuCode} of another row in this batch`,
      });
      duplicates.push({
        rowId: row.id,
        skuCode: row.skuCode,
        existingPath: duplicateOf.existingPath,
        existingVariantId: '',
        existingProductId: '',
      });
      continue;
    }
    seenInBatch.set(row.skuCode, row.id);
    const clash = await catalog.findVariantBySku(workspaceId, row.skuCode);
    if (clash) {
      const existingPath =
        `/api/workspaces/${workspaceId}/catalog/products/` +
        `${clash.productId}/variants/${clash.id}`;
      await imports.updateRow(workspaceId, row.id, {
        status: 'rejected',
        duplicateOf: {
          existingPath,
          existingVariantId: clash.id,
          existingProductId: clash.productId,
          source: 'catalog',
        },
        note: `SKU ${row.skuCode} is already in use`,
      });
      duplicates.push({
        rowId: row.id,
        skuCode: row.skuCode,
        existingPath,
        existingVariantId: clash.id,
        existingProductId: clash.productId,
      });
      continue;
    }
    actionable.push(row);
  }

  // Group rows with the same product name into one product with N variants
  // (one row = one variant). Creation goes through the catalog use-case so
  // every UTA-75 rule (validation, SKU uniqueness, RBAC) still applies.
  const groups = new Map<string, ImportRowRecord[]>();
  for (const row of actionable) {
    const key = row.productName.trim().toLowerCase();
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  for (const group of groups.values()) {
    const head = group[0];
    if (!head) continue;
    let productId: string;
    try {
      const created = await createProduct(catalog, {
        ctx: input.ctx,
        workspaceId,
        name: head.productName,
        unit: head.unit,
        variants: group.map((row) => ({
          skuCode: row.skuCode,
          name: row.variantName,
          barcode: row.barcode,
          sellingPriceCents: row.sellingPriceCents,
          currency: row.currency,
          hppCents: row.hppCents,
          costSource: row.costSource ?? 'import',
          listingName: row.listingName,
        })),
      });
      productId = created.product.id;
      const variantBySku = new Map(
        created.variants.map((v) => [v.skuCode, v] as const)
      );
      for (const row of group) {
        const variant = variantBySku.get(row.skuCode);
        if (!variant) continue;
        await imports.updateRow(workspaceId, row.id, {
          status: 'applied',
          applied: { productId, variantId: variant.id },
          duplicateOf: null,
        });
        applied.push({ rowId: row.id, productId, variantId: variant.id });
        // Store SKU → candidate mapping only. Never touches skuCode.
        await writeMappingCandidate(
          catalog,
          input.ctx,
          workspaceId,
          row,
          variant.id
        );
      }
    } catch (err) {
      // A conflicting SKU that appeared after the pre-check (race) or a
      // validation edge: surface per-row instead of failing the batch.
      const details =
        typeof err === 'object' && err !== null && 'details' in err
          ? (err as { details?: ImportDuplicateRef }).details
          : undefined;
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (code === 'CATALOG_CONFLICT') {
        for (const row of group) {
          const clash = await catalog.findVariantBySku(
            workspaceId,
            row.skuCode
          );
          const existingPath =
            details?.existingPath ??
            (clash
              ? `/api/workspaces/${workspaceId}/catalog/products/` +
                `${clash.productId}/variants/${clash.id}`
              : '');
          await imports.updateRow(workspaceId, row.id, {
            status: 'rejected',
            duplicateOf: {
              existingPath,
              existingVariantId: details?.existingVariantId ?? clash?.id ?? '',
              existingProductId:
                details?.existingProductId ?? clash?.productId ?? '',
              source: 'catalog',
            },
            note: err instanceof Error ? err.message : 'SKU conflict',
          });
          duplicates.push({
            rowId: row.id,
            skuCode: row.skuCode,
            existingPath,
            existingVariantId: clash?.id ?? '',
            existingProductId: clash?.productId ?? '',
          });
        }
        continue;
      }
      throw err;
    }
  }

  if (applied.length === 0 && duplicates.length === 0 && skipped.length > 0) {
    throw importConflict('No confirmable rows: every selected row was skipped');
  }

  const refreshed = await refreshBatchCounts(imports, workspaceId, batch.id);
  return { batch: refreshed, applied, duplicates, skipped };
}

/**
 * Marketplace Store SKU → `catalog_channel_mappings` candidate. Best-effort:
 * mapping failures (e.g. the listing is already mapped) never fail the
 * confirm — the catalog record already exists and the hint stays on the row.
 */
async function writeMappingCandidate(
  catalog: CatalogStore,
  ctx: WorkspaceContext,
  workspaceId: string,
  row: ImportRowRecord,
  variantId: string
): Promise<void> {
  const hasMarketplaceSignal =
    row.channel !== null ||
    row.shopExtId !== null ||
    row.platformSkuId !== null ||
    row.sellerSkuHint !== null;
  if (!hasMarketplaceSignal) return;
  const platformSkuId = row.platformSkuId ?? row.sellerSkuHint;
  if (!platformSkuId) return;
  try {
    await createMapping(catalog, {
      ctx,
      workspaceId,
      variantId,
      channel: row.channel ?? 'import',
      shopExtId: row.shopExtId ?? 'import',
      platformSkuId,
      sellerSkuHint: row.sellerSkuHint,
      barcodeHint: row.barcode,
      listingName: row.listingName,
    });
  } catch {
    // Candidate-only: the import row keeps the hint; mapping dedupe is
    // owned by the catalog store (409 on double-mapped listings).
  }
}
