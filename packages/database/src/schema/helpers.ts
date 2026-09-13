import { timestamp, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * UTA-10 conventions — UUID primary keys, UTC timestamps, FK helpers.
 *
 * Rules:
 * - Every table uses a `uuid` primary key with `gen_random_uuid()`.
 *   (`pgcrypto` extension is enabled in the initial migration.)
 * - Every mutable table carries `created_at` / `updated_at` as
 *   `timestamptz` with `now()` defaults. The application always writes UTC.
 * - Append-only ledger tables (e.g. `stock_moves`) carry `created_at` only.
 * - Foreign keys always declare explicit `ON DELETE` behaviour via `fk()`.
 */

/**
 * UUID primary key column: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`.
 */
export function uuidPk(columnName = 'id') {
  return uuid(columnName).primaryKey().defaultRandom();
}

/**
 * UTC timestamp columns for mutable tables.
 * Postgres `timestamptz` stores UTC internally; `defaultNow()` maps to `now()`.
 */
export function utcTimestamps() {
  return {
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  };
}

/**
 * UTC creation timestamp for append-only tables (no `updated_at` by design).
 */
export function utcCreatedAt() {
  return {
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  };
}

/**
 * Foreign-key reference with an explicit ON DELETE action.
 *
 * @example
 * ```ts
 * storeId: fk('store_id', () => stores.id, 'cascade'),
 * ```
 */
export function fk(
  columnName: string,
  column: () => AnyPgColumn,
  onDelete: 'cascade' | 'restrict' | 'set null' | 'no action' = 'restrict'
) {
  return uuid(columnName).notNull().references(column, { onDelete });
}
