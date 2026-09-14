import { timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Shared column conventions (UTA-10).
 *
 * - IDs: UUID primary keys defaulting to `gen_random_uuid()`
 *   (requires the `pgcrypto` extension — enabled in the initial migration).
 * - Time: always `timestamptz` (UTC on the wire); never bare `timestamp`.
 *
 * All helpers are factories returning fresh column instances — a column
 * object must never be shared between two tables.
 */

/** UUID primary key with `gen_random_uuid()` default. */
export function uuidPk(columnName = 'id') {
  return uuid(columnName).primaryKey().defaultRandom();
}

/** UTC creation timestamp (`timestamptz`, defaults to `now()`). */
export function createdAtColumn() {
  return timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull();
}

/** UTC last-update timestamp (`timestamptz`, defaults to `now()`). */
export function updatedAtColumn() {
  return timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull();
}

/** Standard `created_at` / `updated_at` UTC pair for a table. */
export function utcTimestampColumns() {
  return {
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  };
}

/** UTC event timestamp (`timestamptz`, defaults to `now()`). */
export function occurredAtColumn(columnName = 'occurred_at') {
  return timestamp(columnName, { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull();
}
