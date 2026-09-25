import {
  pgTable,
  text,
  uuid,
  integer,
  timestamp,
  primaryKey,
  foreignKey,
} from 'drizzle-orm/pg-core';

import { workspaces } from './tenancy/workspace-tables';
import { warehouses } from './catalog/warehouse-tables';
import { variants } from './catalog/variant-tables';

// Transfer management tables

export const transfers = pgTable(
  'catalog_transfers',
  {
    id: text('id').primaryKey(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),
    referenceNum: text('reference_num').notNull(),
    sourceWarehouseId: text('source_warehouse_id').references(
      () => warehouses.id,
      { onDelete: 'cascade' }
    ),
    destWarehouseId: text('dest_warehouse_id').references(() => warehouses.id, {
      onDelete: 'cascade',
    }),
    status: text('status').notNull(),
    notes: text('notes'),
    expectedReceiveDate: timestamp('expected_receive_date'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    workspaceReferenceNumUnique: uniqueIndex(
      'catalog_transfers_workspace_reference_num_unique'
    ).on(table.workspaceId, table.referenceNum),
  })
);

export const transferItems = pgTable(
  'catalog_transfer_items',
  {
    id: text('id').primaryKey(),
    transferId: text('transfer_id').references(() => transfers.id, {
      onDelete: 'cascade',
    }),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, {
      onDelete: 'cascade',
    }),
    variantId: text('variant_id').references(() => variants.id, {
      onDelete: 'cascade',
    }),
    requestedQty: integer('requested_qty').notNull(),
    sentQty: integer('sent_qty').notNull().default(0),
    receivedQty: integer('received_qty').notNull().default(0),
    damagedQty: integer('damaged_qty').notNull().default(0),
    cancellationReason: text('cancellation_reason'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    workspaceTransferVariantUq: uniqueIndex(
      'catalog_transfer_items_workspace_transfer_variant_unique'
    ).on(table.workspaceId, table.transferId, table.variantId),
  })
);
