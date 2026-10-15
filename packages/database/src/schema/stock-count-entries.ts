import {
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { utcCreatedAt, uuidPk } from './helpers';
import { stockCountSessions } from './stock-count-sessions';
import { stockCountLines } from './stock-count-lines';

/**
 * Stock opname count entries (UTA-32 / US12, RFC 03 task 2c).
 * Append-only scan/typed entry log. Migration: infra/drizzle/0019_stock_counts.sql.
 */
export const stockCountEntries = pgTable(
  'stock_count_entries',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => stockCountSessions.id, { onDelete: 'cascade' }),
    lineId: uuid('line_id')
      .notNull()
      .references(() => stockCountLines.id, { onDelete: 'cascade' }),
    qty: integer('qty').notNull(),
    mode: text('mode').notNull(),
    clientEntryId: text('client_entry_id').notNull(),
    deviceLabel: text('device_label'),
    actorId: text('actor_id').notNull(),
    createdAt: utcCreatedAt(),
  },
  (t) => [
    uniqueIndex('stock_count_entries_workspace_client_entry_unique').on(
      t.workspaceId,
      t.clientEntryId
    ),
    index('stock_count_entries_line_idx').on(t.lineId, t.createdAt),
  ]
);

export type StockCountEntryRow = typeof stockCountEntries.$inferSelect;
export type NewStockCountEntryRow = typeof stockCountEntries.$inferInsert;
