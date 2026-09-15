import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { utcCreatedAt, uuidPk } from './helpers';

/**
 * Audit events — append-only log owned by a tenant.
 * Demonstrates the FK helper convention: child rows cascade when
 * the parent tenant is removed (tenants are only deleted in
 * non-production scrub operations).
 *
 * UTA-19 baseline: actor + category columns so membership/role changes,
 * workspace create/update, and MVP security events (UTA-17) are auditable
 * without PII/secrets. All new columns are nullable for backward compat
 * with pre-UTA-19 rows. Payloads carry opaque ids only — never email,
 * tokens, or raw secrets (enforced by `assertTenancyPayloadSafe` at the
 * use-case boundary).
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
    /** Opaque actor kind, e.g. `user` / `system`. Never PII. */
    actorType: text('actor_type'),
    /** Opaque actor id (user id). Never email/name. */
    actorId: text('actor_id'),
    /** `membership` | `workspace` | `security`. */
    category: text('category'),
    /** End-to-end trace id propagated from the request/job. */
    correlationId: text('correlation_id'),
    createdAt: utcCreatedAt(),
  },
  (t) => [
    index('audit_events_tenant_id_created_at_idx').on(t.tenantId, t.createdAt),
  ]
);

export type AuditEventRow = typeof auditEvents.$inferSelect;
export type NewAuditEventRow = typeof auditEvents.$inferInsert;
