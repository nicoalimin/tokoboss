import { z } from 'zod';

/**
 * Unstructured product import wire contracts (UTA-77, Story 02).
 *
 * Server-side only validation — these schemas gate Route Handler bodies;
 * tenancy, RBAC, and the marketplace-SKU freeze are enforced in
 * `@tokoboss/application`, never just here. No secrets or PII cross this
 * boundary (ids are opaque workspace/batch/row references).
 *
 * Two upload shapes (same review pipeline):
 * - `content`: raw CSV text (the MVP upload shape).
 * - `rows`: pre-parsed objects for xlsx/photo/PDF converter output — the
 *   server never parses binary formats (see runbook).
 */

export const ImportBatchStatusSchema = z.enum([
  'draft',
  'review',
  'applied',
  'rejected',
]);
export type ImportBatchStatusWire = z.infer<typeof ImportBatchStatusSchema>;

export const ImportRowStatusSchema = z.enum([
  'draft',
  'review',
  'applied',
  'rejected',
]);
export type ImportRowStatusWire = z.infer<typeof ImportRowStatusSchema>;

/** One pre-parsed candidate row (header aliases resolved server-side). */
export const ImportRowInputSchema = z
  .record(z.string(), z.unknown())
  .refine((r) => Object.keys(r).length > 0 && Object.keys(r).length <= 40, {
    message: 'Each row must be an object with 1–40 fields.',
  });
export type ImportRowInput = z.infer<typeof ImportRowInputSchema>;

/** POST /api/workspaces/:workspaceId/imports (Manager/Admin) */
export const CreateImportBodySchema = z
  .object({
    filename: z.string().trim().min(1).max(200),
    contentType: z.string().trim().min(1).max(120),
    content: z.string().max(1_000_000).optional(),
    rows: z.array(ImportRowInputSchema).min(1).max(500).optional(),
    idempotencyKey: z.string().trim().min(1).max(128).optional(),
  })
  .refine((v) => v.content !== undefined || v.rows !== undefined, {
    message: 'Either content (CSV) or rows is required.',
  });
export type CreateImportBody = z.infer<typeof CreateImportBodySchema>;

/** PATCH /api/workspaces/:workspaceId/imports/:batchId/rows/:rowId */
export const PatchImportRowBodySchema = z
  .object({
    productName: z.string().trim().min(1).max(200).optional(),
    skuCode: z.string().trim().min(1).max(64).optional(),
    variantName: z.string().trim().min(1).max(200).nullable().optional(),
    barcode: z.string().trim().min(1).max(64).nullable().optional(),
    sellingPriceCents: z.number().int().nonnegative().optional(),
    currency: z.string().trim().min(1).max(8).optional(),
    hppCents: z.number().int().nonnegative().nullable().optional(),
    costSource: z.string().trim().min(1).max(120).nullable().optional(),
    listingName: z.string().trim().min(1).max(200).nullable().optional(),
    unit: z.string().trim().min(1).max(24).optional(),
    channel: z.string().trim().min(1).max(40).nullable().optional(),
    shopExtId: z.string().trim().min(1).max(200).nullable().optional(),
    platformSkuId: z.string().trim().min(1).max(200).nullable().optional(),
    sellerSkuHint: z.string().trim().min(1).max(200).nullable().optional(),
    status: z.literal('rejected').optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Nothing to update.',
  });
export type PatchImportRowBody = z.infer<typeof PatchImportRowBodySchema>;

/** PATCH /api/workspaces/:workspaceId/imports/:batchId */
export const PatchImportBatchBodySchema = z.object({
  action: z.enum(['reject', 'reopen']),
});
export type PatchImportBatchBody = z.infer<typeof PatchImportBatchBodySchema>;

/** POST /api/workspaces/:workspaceId/imports/:batchId/confirm */
export const ConfirmImportBodySchema = z.object({
  rowIds: z.array(z.string().min(1)).min(1).max(500).optional(),
});
export type ConfirmImportBody = z.infer<typeof ConfirmImportBodySchema>;

// Views

export const ImportDuplicateViewSchema = z.object({
  existingPath: z.string(),
  existingVariantId: z.string(),
  existingProductId: z.string(),
  source: z.enum(['catalog', 'batch']),
});
export type ImportDuplicateView = z.infer<typeof ImportDuplicateViewSchema>;

export const ImportAppliedViewSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
});
export type ImportAppliedView = z.infer<typeof ImportAppliedViewSchema>;

export const ImportRowViewSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  batchId: z.string().min(1),
  rowNumber: z.number().int(),
  status: ImportRowStatusSchema,
  productName: z.string(),
  skuCode: z.string().min(1),
  variantName: z.string().nullable(),
  barcode: z.string().nullable(),
  sellingPriceCents: z.number().int().nonnegative(),
  currency: z.string(),
  hppCents: z.number().int().nonnegative().nullable(),
  costSource: z.string().nullable(),
  listingName: z.string().nullable(),
  unit: z.string(),
  channel: z.string().nullable(),
  shopExtId: z.string().nullable(),
  platformSkuId: z.string().nullable(),
  sellerSkuHint: z.string().nullable(),
  errors: z.array(z.string()),
  duplicateOf: ImportDuplicateViewSchema.nullable(),
  applied: ImportAppliedViewSchema.nullable(),
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ImportRowView = z.infer<typeof ImportRowViewSchema>;

export const ImportBatchViewSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  jobId: z.string().nullable(),
  sourceFilename: z.string(),
  sourceMime: z.string(),
  sourceByteSize: z.number().int().nonnegative(),
  status: ImportBatchStatusSchema,
  totalRows: z.number().int().nonnegative(),
  readyRows: z.number().int().nonnegative(),
  appliedRows: z.number().int().nonnegative(),
  rejectedRows: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  rows: z.array(ImportRowViewSchema).optional(),
});
export type ImportBatchView = z.infer<typeof ImportBatchViewSchema>;

export const ConfirmImportResultViewSchema = z.object({
  applied: z.array(
    z.object({
      rowId: z.string().min(1),
      productId: z.string().min(1),
      variantId: z.string().min(1),
    })
  ),
  duplicates: z.array(
    z.object({
      rowId: z.string().min(1),
      skuCode: z.string().min(1),
      existingPath: z.string(),
      existingVariantId: z.string(),
      existingProductId: z.string(),
    })
  ),
  skipped: z.array(
    z.object({ rowId: z.string().min(1), reason: z.string().min(1) })
  ),
});
export type ConfirmImportResultView = z.infer<
  typeof ConfirmImportResultViewSchema
>;
