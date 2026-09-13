import { pgTable, text } from 'drizzle-orm/pg-core';
import { utcTimestamps, uuidPk } from './helpers.js';

/**
 * `stores` — a tenant storefront (Indonesian MSME shop).
 */
export const stores = pgTable('stores', {
  id: uuidPk(),
  name: text('name').notNull(),
  ...utcTimestamps(),
});

export type StoreRow = typeof stores.$inferSelect;
export type NewStoreRow = typeof stores.$inferInsert;
