import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { catalogWarehouses } from './catalog';
import { tenants } from './tenants';
import { utcTimestamps, uuidPk } from './helpers';

/**
 * Stock opname sessions (UTA-32 / US12, RFC 03 task 2a).
 * Migration: infra/drizzle/0019_stock_counts.sql.
 */
export const stockCountSessions = pgTable(
  'stock_count_sessions',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => catalogWarehouses.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    scopeType: text('scope_type').notNull().default('all'),
    status: text('status').notNull().default('counting'),
    freezeOutboundTransfers: boolean('freeze_outbound_transfers')
      .notNull()
      .default(false),
    snapshotAt: timestamp('snapshot_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    createdBy: text('created_by').notNull(),
    submittedBy: text('submitted_by'),
    submittedAt: timestamp('submitted_at', {
      withTimezone: true,
      mode: 'date',
    }),
    submitNote: text('submit_note'),
    returnedBy: text('returned_by'),
    returnedAt: timestamp('returned_at', {
      withTimezone: true,
      mode: 'date',
    }),
    returnNote: text('return_note'),
    postedBy: text('posted_by'),
    postedAt: timestamp('posted_at', { withTimezone: true, mode: 'date' }),
    cancelledBy: text('cancelled_by'),
    cancelledAt: timestamp('cancelled_at', {
      withTimezone: true,
      mode: 'date',
    }),
    cancelReason: text('cancel_reason'),
    selfApproved: boolean('self_approved').notNull().default(false),
    lastActivityAt: timestamp('last_activity_at', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow(),
    version: integer('version').notNull().default(1),
    ...utcTimestamps(),
  },
  (t) => [
    uniqueIndex('stock_count_sessions_workspace_code_unique').on(
      t.workspaceId,
      t.code
    ),
    index('stock_count_sessions_workspace_warehouse_status_idx').on(
      t.workspaceId,
      t.warehouseId,
      t.status
    ),
  ]
);

export type StockCountSessionRow = typeof stockCountSessions.$inferSelect;
export type NewStockCountSessionRow = typeof stockCountSessions.$inferInsert;
