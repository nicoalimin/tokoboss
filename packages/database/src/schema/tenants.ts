import { pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { utcTimestampColumns, uuidPk } from './common.js';

/**
 * Tenant — top-level isolation boundary.
 * Every tenant-scoped row references this table with `tenantFk()`.
 */
export const tenants = pgTable('tenants', {
  id: uuidPk(),
  name: varchar('name', { length: 255 }).notNull(),
  ...utcTimestampColumns(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;

/**
 * Foreign-key helper for tenant-scoped tables.
 * `ON DELETE CASCADE` keeps tenant teardown a single-row delete.
 */
export function tenantFk(columnName = 'tenant_id') {
  return uuid(columnName)
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
}
