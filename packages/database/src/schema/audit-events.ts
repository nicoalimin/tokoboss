import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { utcCreatedAt, uuidPk } from './helpers.js';

/**
 * Audit events — append-only log owned by a tenant.
 * Demonstrates the FK helper convention: child rows cascade when
 * the parent tenant is removed (tenants are only deleted in
 * non-production scrub operations).
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuidPk(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    createdAt: utcCreatedAt(),
  },
  (t) => [
    index('audit_events_tenant_id_created_at_idx').on(t.tenantId, t.createdAt),
  ]
);

export type AuditEventRow = typeof auditEvents.$inferSelect;
export type NewAuditEventRow = typeof auditEvents.$inferInsert;
