import { integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { fk, utcTimestamps, uuidPk } from './helpers.js';
import { stores } from './stores.js';

/**
 * `products` — sellable items belonging to a store.
 * SKU is unique per store (`store_id`, `sku`).
 */
export const products = pgTable(
  'products',
  {
    id: uuidPk(),
    storeId: fk('store_id', () => stores.id, 'cascade'),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    priceCents: integer('price_cents').notNull(),
    ...utcTimestamps(),
  },
  (t) => [uniqueIndex('products_store_sku_unique').on(t.storeId, t.sku)]
);

export type ProductRow = typeof products.$inferSelect;
export type NewProductRow = typeof products.$inferInsert;
