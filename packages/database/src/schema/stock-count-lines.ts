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
import { stockCountSessions } from './stock-count-sessions';

/**
 * Stock opname count lines (UTA-32 / US12, RFC 03 task 2b).
 * Migration: infra/drizzle/0019_stock_counts.sql.
 */
export const stockCountLines = pgTable(
  'stock_count_lines',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => stockCountSessions.id, { onDelete: 'cascade' }),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => catalogWarehouses.id, { onDelete: 'restrict' }),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => catalogVariants.id, { onDelete: 'restrict' }),
    snapshotQty: integer('snapshot_qty').notNull(),
    countedQty: integer('counted_qty'),
    systemQtyAtCount: integer('system_qty_at_count'),
    countedAt: timestamp('counted_at', { withTimezone: true, mode: 'date' }),
    countedBy: text('counted_by'),
    entryCount: integer('entry_count').notNull().default(0),
    varianceReasonCode: text('variance_reason_code'),
    varianceNote: text('variance_note'),
    ...utcTimestamps(),
  },
  (t) => [
    uniqueIndex('stock_count_lines_session_variant_unique').on(
      t.sessionId,
      t.variantId
    ),
  ]
);

export type StockCountLineRow = typeof stockCountLines.$inferSelect;
export type NewStockCountLineRow = typeof stockCountLines.$inferInsert;
