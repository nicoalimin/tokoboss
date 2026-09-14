import { pgTable, text } from 'drizzle-orm/pg-core';
import { utcTimestamps, uuidPk } from './helpers';

/**
 * Tenants — top-level isolation boundary.
 * Every business row in future migrations must reference a tenant.
 */
export const tenants = pgTable('tenants', {
  id: uuidPk(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ...utcTimestamps(),
});

export type TenantRow = typeof tenants.$inferSelect;
export type NewTenantRow = typeof tenants.$inferInsert;
