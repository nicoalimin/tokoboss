import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { jobs } from './jobs';
import { tenants } from './tenants';
import { utcTimestamps, uuidPk } from './helpers';
import type {
  ImportAppliedRef,
  ImportDuplicateRef,
} from '@tokoboss/application';

/**
 * Unstructured product import batches + row candidates (UTA-77, Story 02).
 *
 * Tenancy: every row carries `workspace_id → tenants.id` (a workspace IS
 * the tenant boundary, same convention as `jobs` / `catalog_*`). All reads
 * and writes are workspace-scoped in `DrizzleProductImportStore`.
 *
 * - `product_import_batches`: one row per upload. `job_id` links the
 *   `product-import` job in `jobs`/`job_events` (observability only — the
 *   batch stays reviewable/confirmable without it). Status lifecycle:
 *   `draft ↔ review → applied`, with `rejected` (explicit batch reject,
 *   reopenable to draft/review).
 * - `product_import_rows`: one reviewable candidate per input row.
 *   `sku_code` is the proposed SKU TokoBoss identity; `seller_sku_hint` /
 *   `platform_sku_id` (+ `channel`, `shop_ext_id`) are marketplace mapping
 *   candidates only (Story 02 freeze — never identity). Row statuses
 *   `draft` (needs fixes) / `review` (ready) / `applied` / `rejected`.
 *
 * Nothing here touches the catalog: confirm-before-create goes through the
 * catalog use-cases, which own SKU uniqueness and mapping constraints.
 */
export const productImportBatches = pgTable(
  'product_import_batches',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id').references(() => jobs.id, {
      onDelete: 'set null',
    }),
    sourceFilename: text('source_filename').notNull(),
    sourceMime: text('source_mime').notNull(),
    sourceByteSize: integer('source_byte_size').notNull().default(0),
    status: text('status').notNull().default('draft'),
    totalRows: integer('total_rows').notNull().default(0),
    readyRows: integer('ready_rows').notNull().default(0),
    appliedRows: integer('applied_rows').notNull().default(0),
    rejectedRows: integer('rejected_rows').notNull().default(0),
    idempotencyKey: text('idempotency_key').notNull(),
    createdById: text('created_by_id'),
    ...utcTimestamps(),
  },
  (t) => [
    uniqueIndex('product_import_batches_workspace_idempotency_unique').on(
      t.workspaceId,
      t.idempotencyKey
    ),
    index('product_import_batches_workspace_status_idx').on(
      t.workspaceId,
      t.status
    ),
  ]
);

export const productImportRows = pgTable(
  'product_import_rows',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => productImportBatches.id, { onDelete: 'cascade' }),
    rowNumber: integer('row_number').notNull(),
    status: text('status').notNull().default('draft'),
    productName: text('product_name').notNull().default(''),
    skuCode: text('sku_code').notNull().default(''),
    variantName: text('variant_name'),
    barcode: text('barcode'),
    sellingPriceCents: integer('selling_price_cents').notNull().default(0),
    currency: text('currency').notNull().default('IDR'),
    hppCents: integer('hpp_cents'),
    costSource: text('cost_source'),
    listingName: text('listing_name'),
    unit: text('unit').notNull().default('pcs'),
    channel: text('channel'),
    shopExtId: text('shop_ext_id'),
    platformSkuId: text('platform_sku_id'),
    sellerSkuHint: text('seller_sku_hint'),
    errors: jsonb('errors').$type<string[]>().notNull().default([]),
    duplicateOf: jsonb('duplicate_of').$type<ImportDuplicateRef | null>(),
    applied: jsonb('applied').$type<ImportAppliedRef | null>(),
    note: text('note'),
    raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
    ...utcTimestamps(),
  },
  (t) => [
    index('product_import_rows_batch_number_idx').on(t.batchId, t.rowNumber),
    index('product_import_rows_workspace_batch_idx').on(
      t.workspaceId,
      t.batchId
    ),
  ]
);

export type ProductImportBatchRow = typeof productImportBatches.$inferSelect;
export type NewProductImportBatchRow = typeof productImportBatches.$inferInsert;
export type ProductImportRowRow = typeof productImportRows.$inferSelect;
export type NewProductImportRowRow = typeof productImportRows.$inferInsert;
