import { drizzle as drizzlePostgresJs } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from './schema/index';

export type Database = PostgresJsDatabase<typeof schema>;

/** Logical unit of work passed to {@link withTransaction} callbacks. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Structural query surface shared by the postgres-js adapter and the PGlite
 * test adapter (`drizzle-orm/postgres-js` vs `drizzle-orm/pglite`).
 * Builders stay `any` so this port is dialect-agnostic; inputs and outputs
 * are typed at each method boundary instead.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyQueryBuilder = any;
export interface DatabaseHandle {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select: (...args: any[]) => AnyQueryBuilder;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insert: (...args: any[]) => AnyQueryBuilder;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: (...args: any[]) => AnyQueryBuilder;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete: (...args: any[]) => AnyQueryBuilder;
}

export interface DbHandle {
  db: Database;
  /** Raw postgres.js client — call `close()` on shutdown. */
  client: postgres.Sql;
  close: () => Promise<void>;
  /**
   * Transaction-capable wrapper. Commits on resolve, rolls back on throw.
   * All queries inside `fn` must use the provided `tx` handle.
   */
  withTransaction: <T>(fn: (tx: Transaction) => Promise<T>) => Promise<T>;
}

export interface CreateDbOptions {
  /** Defaults to 10. Migrations should use `max: 1`. */
  maxConnections?: number;
  /** `postgres.js` idle timeout in seconds. */
  idleTimeoutSecs?: number;
  /** Fail fast when the server is unreachable. */
  connectTimeoutSecs?: number;
}

function requireConnectionString(value: string | undefined): string {
  if (!value || value.trim().length === 0) {
    throw new Error(
      'DATABASE_URL is not set. ' +
        'Use a Neon branch URL for the target environment (never production credentials in tests/seeds).'
    );
  }
  return value;
}

/**
 * Create a transaction-capable Drizzle adapter backed by postgres.js.
 * Works against Neon (pooled or direct) and any Postgres-compatible URL.
 */
export function createDb(
  connectionString: string | undefined,
  options: CreateDbOptions = {}
): DbHandle {
  const url = requireConnectionString(connectionString);
  const client = postgres(url, {
    max: options.maxConnections ?? 10,
    idle_timeout: options.idleTimeoutSecs ?? 20,
    connect_timeout: options.connectTimeoutSecs ?? 10,
    // Neon requires SSL; `postgres` enables it automatically for
    // `postgres://…sslmode=require` / Neon hostnames.
    prepare: false,
  });
  const db = drizzlePostgresJs(client, { schema });

  return {
    db,
    client,
    close: async () => {
      await client.end({ timeout: 5 });
    },
    withTransaction: <T>(fn: (tx: Transaction) => Promise<T>): Promise<T> =>
      db.transaction(fn),
  };
}
