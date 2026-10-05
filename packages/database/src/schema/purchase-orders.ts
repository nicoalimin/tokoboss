import {
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { catalogVariants } from './catalog';
import { tenants } from './tenants';
import { utcTimestamps, uuidPk } from './helpers';

/**
 * Draft purchase-order tables (UTA-146 Slice 1d / Story 11).
 *
 * Tenancy: every row carries `workspace_id → tenants.id`.
 * - `catalog_purchase_orders`: draft PO header (nullable supplier stub).
 * - `catalog_purchase_order_items`: lines with nullable unit_cost_cents
 *   (missing HPP flagged at read time — never invent prices).
 * Status stays `draft` in Story 11; send/receive belongs to Story 10 / WS6.
 */
export const catalogPurchaseOrders = pgTable(
  'catalog_purchase_orders',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    referenceNum: text('reference_num').notNull(),
    status: text('status').notNull().default('draft'),
    supplierName: text('supplier_name'),
    notes: text('notes'),
    version: integer('version').notNull().default(1),
    ...utcTimestamps(),
  },
  (t) => [
    uniqueIndex('catalog_purchase_orders_workspace_reference_num_unique').on(
      t.workspaceId,
      t.referenceNum
    ),
    index('catalog_purchase_orders_workspace_status_idx').on(
      t.workspaceId,
      t.status
    ),
  ]
);

export const catalogPurchaseOrderItems = pgTable(
  'catalog_purchase_order_items',
  {
    id: uuidPk(),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => catalogPurchaseOrders.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => catalogVariants.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    unitCostCents: integer('unit_cost_cents'),
    version: integer('version').notNull().default(1),
    ...utcTimestamps(),
  },
  (t) => [
    index('catalog_purchase_order_items_workspace_po_idx').on(
      t.workspaceId,
      t.purchaseOrderId
    ),
  ]
);

export type CatalogPurchaseOrderRow = typeof catalogPurchaseOrders.$inferSelect;
export type NewCatalogPurchaseOrderRow =
  typeof catalogPurchaseOrders.$inferInsert;
export type CatalogPurchaseOrderItemRow =
  typeof catalogPurchaseOrderItems.$inferSelect;
export type NewCatalogPurchaseOrderItemRow =
  typeof catalogPurchaseOrderItems.$inferInsert;

/**
 * Export for schema aggregation (./schema/index.ts).
 * @internal Do not reference directly; use catalogPurchaseOrders/Items.
 */
export const purchaseOrderSchema = {
  catalogPurchaseOrders,
  catalogPurchaseOrderItems,
};
