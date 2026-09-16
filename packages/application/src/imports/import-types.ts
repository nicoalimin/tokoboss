/**
 * Unstructured product import records (UTA-77, Story 02).
 *
 * A batch is one uploaded file (CSV text, or pre-parsed `rows` from an
 * xlsx/photo/PDF converter). Each row is a reviewable product/SKU
 * candidate. Nothing touches the catalog until an explicit confirm call
 * creates Product/SKU TokoBoss rows through the UTA-75 use-cases.
 *
 * Freeze (Story 02): marketplace Store SKU text from the import
 * (`sellerSkuHint` / `platformSkuId`) is a **candidate mapping** only —
 * it is written to `catalog_channel_mappings` on confirm and NEVER
 * replaces the SKU TokoBoss identity (`skuCode`).
 */

export const IMPORT_BATCH_STATUSES = [
  'draft',
  'review',
  'applied',
  'rejected',
] as const;
export type ImportBatchStatus = (typeof IMPORT_BATCH_STATUSES)[number];

export const IMPORT_ROW_STATUSES = [
  'draft',
  'review',
  'applied',
  'rejected',
] as const;
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

export function isImportBatchStatus(
  value: unknown
): value is ImportBatchStatus {
  return (
    typeof value === 'string' &&
    (IMPORT_BATCH_STATUSES as readonly string[]).includes(value)
  );
}

export function isImportRowStatus(value: unknown): value is ImportRowStatus {
  return (
    typeof value === 'string' &&
    (IMPORT_ROW_STATUSES as readonly string[]).includes(value)
  );
}

/** Pointer to the catalog row an import row was confirmed into. */
export interface ImportAppliedRef {
  productId: string;
  variantId: string;
}

/** Pointer to the pre-existing catalog row blocking an import row. */
export interface ImportDuplicateRef {
  existingPath: string;
  existingVariantId: string;
  existingProductId: string;
  /** `catalog` = SKU TokoBoss already exists; `batch` = duplicate in-batch. */
  source: 'catalog' | 'batch';
}

export interface ImportBatchRecord {
  id: string;
  workspaceId: string;
  /** Linked `jobs` row (`product-import`), null when created without one. */
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
  createdAt: Date;
  updatedAt: Date;
}

/**
 * One reviewable candidate. `skuCode` is the proposed SKU TokoBoss
 * identity (supplied via `sku_tokoboss`, or server-generated when blank).
 * `sellerSkuHint` / `platformSkuId` / `channel` / `shopExtId` are
 * marketplace mapping candidates only.
 */
export interface ImportRowRecord {
  id: string;
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
  /** Blocking validation messages; empty = ready to confirm. */
  errors: string[];
  duplicateOf: ImportDuplicateRef | null;
  applied: ImportAppliedRef | null;
  note: string | null;
  /** Original submitted values (ids/opaque refs only, no secrets). */
  raw: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** A single parsed input row before persistence (CSV or `rows` body). */
export interface ParsedImportRow {
  rowNumber: number;
  raw: Record<string, unknown>;
  productName: string;
  skuCode: string | null;
  variantName: string | null;
  barcode: string | null;
  sellingPriceCents: number | null;
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
}
