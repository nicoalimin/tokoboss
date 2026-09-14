import { jsonb, pgTable, varchar } from 'drizzle-orm/pg-core';
import { occurredAtColumn, uuidPk } from './common.js';
import { tenantFk } from './tenants.js';

/**
 * Audit event — append-only log scoped to a tenant.
 * Demonstrates the `tenantFk()` helper and UTC event timestamps.
 */
export const auditEvents = pgTable('audit_events', {
  id: uuidPk(),
  tenantId: tenantFk(),
  eventType: varchar('event_type', { length: 128 }).notNull(),
  payload: jsonb('payload').notNull().default({}),
  occurredAt: occurredAtColumn(),
});

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
