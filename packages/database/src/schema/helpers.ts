import { timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * UUID primary key convention.
 * - `uuid` type with `gen_random_uuid()` default (pgcrypto / pg built-in).
 * - All tables use `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`.
 */
export function uuidPk(columnName = 'id') {
  return uuid(columnName).primaryKey().defaultRandom();
}

/**
 * UTC timestamp conventions.
 * - `timestamptz` (timezone-aware, stored as UTC).
 * - `created_at` defaults to `now()`, never null, immutable after insert.
 * - `updated_at` defaults to `now()`, kept fresh via `$onUpdate`.
 */
export function utcTimestamps() {
  return {
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  };
}

/**
 * Immutable creation timestamp (for append-only / audit tables).
 */
export function utcCreatedAt(columnName = 'created_at') {
  return timestamp(columnName, { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull();
}

/**
 * Foreign-key delete behaviours used across the schema.
 * Prefer `restrict` for business data, `cascade` for owned child rows
 * (e.g. audit events owned by a tenant).
 */
export const fkActions = {
  cascade: 'cascade',
  restrict: 'restrict',
  setNull: 'set null',
  noAction: 'no action',
} as const;
