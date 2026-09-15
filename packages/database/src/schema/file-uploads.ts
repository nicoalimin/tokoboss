import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { utcTimestamps, uuidPk } from './helpers';

/**
 * File uploads — private object-storage metadata (UTA-15).
 *
 * One row per operational file (imports, manual-order files, SKU pictures,
 * labels, evidence, returns, exports, fixtures). Stores the private
 * pathname/URL **reference** only — Blob contents are never stored in
 * Postgres.
 *
 * Tenancy: `workspace_id` references `tenants.id` (a workspace IS the
 * tenant isolation boundary, same convention as `jobs`). Every read is
 * workspace-scoped; cross-workspace access is denied at the use-case
 * boundary.
 *
 * Idempotency: `(workspace_id, idempotency_key)` is unique, so a duplicate
 * token request or completion callback resolves to the existing row instead
 * of duplicating effects. `(workspace_id, pathname)` is additionally unique
 * so two uploads can never claim the same private object.
 *
 * Status lifecycle: `pending → completed`, with `deleted` (tombstone kept
 * for audit; product-specific retention policies are out of scope).
 */
export const fileUploads = pgTable(
  'file_uploads',
  {
    id: uuidPk(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Operational purpose: import | manual-order | sku-picture | label |
     *  evidence | return | export | fixture. */
    purpose: text('purpose').notNull(),
    /** Related business entity (e.g. order/sku/claim id) — ids only, no PII. */
    relatedEntityType: text('related_entity_type'),
    relatedEntityId: text('related_entity_id'),
    /** Private store pathname, server-derived (never client-supplied). */
    pathname: text('pathname').notNull(),
    /** Short-lived reference/grant URL — never raw bytes, never secrets. */
    url: text('url'),
    contentType: text('content_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    /** Hex checksum (e.g. sha256) supplied at completion; null while pending. */
    checksum: text('checksum'),
    /** Business idempotency key (caller-supplied, opaque, no PII). */
    idempotencyKey: text('idempotency_key').notNull(),
    /** Who uploaded (opaque ids only, never email/name). */
    createdByType: text('created_by_type'),
    createdById: text('created_by_id'),
    status: text('status').notNull().default('pending'),
    /** Optional retention horizon; cleanup policy itself is out of scope. */
    retentionUntil: timestamp('retention_until', {
      withTimezone: true,
      mode: 'date',
    }),
    completedAt: timestamp('completed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    ...utcTimestamps(),
  },
  (t) => [
    uniqueIndex('file_uploads_workspace_idempotency_unique').on(
      t.workspaceId,
      t.idempotencyKey
    ),
    uniqueIndex('file_uploads_workspace_pathname_unique').on(
      t.workspaceId,
      t.pathname
    ),
    index('file_uploads_workspace_status_idx').on(t.workspaceId, t.status),
    index('file_uploads_workspace_purpose_idx').on(t.workspaceId, t.purpose),
  ]
);

export type FileUploadRow = typeof fileUploads.$inferSelect;
export type NewFileUploadRow = typeof fileUploads.$inferInsert;
