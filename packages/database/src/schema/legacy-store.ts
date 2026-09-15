import { integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { utcCreatedAt, utcTimestamps, uuidPk } from './helpers';

/**
 * Legacy store-catalog tables (migration `0002_initial_schema`).
 *
 * These tables exist in every deployed database but have no active
 * repository or use-case yet (catalog work lands in a later workstream).
 * They are declared here — and included in the Drizzle `schema` object —
 * so `drizzle-kit generate` sees the full production shape and does not
 * prompt to drop/rename them on every new migration. Do not add new
 * queries against these tables without a workstream ticket; do not remove
 * them (destructive contract change).
 */
export const stores = pgTable('stores', {
  id: uuidPk(),
  name: text('name').notNull(),
  ...utcTimestamps(),
});

export const products = pgTable(
  'products',
  {
    id: uuidPk(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    priceCents: integer('price_cents').notNull(),
    ...utcTimestamps(),
  },
  (t) => [uniqueIndex('products_store_sku_unique').on(t.storeId, t.sku)]
);

export const stockMoves = pgTable('stock_moves', {
  id: uuidPk(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'cascade' }),
  qty: integer('qty').notNull(),
  reason: text('reason').notNull(),
  createdAt: utcCreatedAt(),
});

export type StoreRow = typeof stores.$inferSelect;
export type ProductRow = typeof products.$inferSelect;
export type StockMoveRow = typeof stockMoves.$inferSelect;
