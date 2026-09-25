import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { catalogVariants, catalogWarehouses } from './catalog';
import { tenants } from './tenants';
import { utcTimestamps, uuidPk } from './helpers';

/**
 * Transfer management tables (UTA-94, Story 06).
 *
 * Tenancy: every row carries `workspace_id → tenants.id`.
 * - `catalog_transfers`: transfer document header (source/dest warehouse).
 * - `catalog_transfer_items`: line items referencing variants.
 */
export const catalogTransfers = pgTable(
  'catalog_transfers',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    referenceNum: text('reference_num').notNull(),
    sourceWarehouseId: uuid('source_warehouse_id')
      .notNull()
      .references(() => catalogWarehouses.id, { onDelete: 'restrict' }),
    destWarehouseId: uuid('dest_warehouse_id')
      .notNull()
      .references(() => catalogWarehouses.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('draft'),
    notes: text('notes'),
    expectedReceiveDate: timestamp('expected_receive_date', {
      withTimezone: true,
      mode: 'date',
    }),
    version: integer('version').notNull().default(1),
    ...utcTimestamps(),
  },
  (t) => [
    uniqueIndex('catalog_transfers_workspace_reference_num_unique').on(
      t.workspaceId,
      t.referenceNum
    ),
  ]
);

export const catalogTransferItems = pgTable(
  'catalog_transfer_items',
  {
    id: uuidPk(),
    transferId: uuid('transfer_id')
      .notNull()
      .references(() => catalogTransfers.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => catalogVariants.id, { onDelete: 'restrict' }),
    requestedQty: integer('requested_qty').notNull(),
    sentQty: integer('sent_qty').notNull().default(0),
    receivedQty: integer('received_qty').notNull().default(0),
    damagedQty: integer('damaged_qty').notNull().default(0),
    cancellationReason: text('cancellation_reason'),
    version: integer('version').notNull().default(1),
    ...utcTimestamps(),
  },
  (t) => [
    uniqueIndex('catalog_transfer_items_workspace_transfer_idx').on(
      t.workspaceId,
      t.transferId
    ),
  ]
);

export type CatalogTransferRow = typeof catalogTransfers.$inferSelect;
export type NewCatalogTransferRow = typeof catalogTransfers.$inferInsert;
export type CatalogTransferItemRow = typeof catalogTransferItems.$inferSelect;
export type NewCatalogTransferItemRow =
  typeof catalogTransferItems.$inferInsert;

/**
 * Export for schema aggregation (./schema/index.ts).
 * @internal Do not reference directly; use catalogTransfers/catalogTransferItems.
 */
export const transferSchema = {
  catalogTransfers,
  catalogTransferItems,
};
