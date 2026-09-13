import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { fk, utcCreatedAt, uuidPk } from './helpers.js';
import { products } from './products.js';

/**
 * `stock_moves` — append-only inventory ledger.
 * No `updated_at` by design: rows are never mutated, only inserted.
 * Current stock is derived as `SUM(qty)` per product.
 */
export const stockMoves = pgTable('stock_moves', {
  id: uuidPk(),
  productId: fk('product_id', () => products.id, 'cascade'),
  qty: integer('qty').notNull(),
  reason: text('reason').notNull(),
  ...utcCreatedAt(),
});

export type StockMoveRow = typeof stockMoves.$inferSelect;
export type NewStockMoveRow = typeof stockMoves.$inferInsert;
