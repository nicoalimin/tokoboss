import type { DatabasePort } from '@tokoboss/domain';
import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../schema/index.js';

export type DrizzleDb = NodePgDatabase<typeof schema>;

/** Transaction executor passed by `db.transaction()` (inferred, no internal imports). */
export type DrizzleTx = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0];

/**
 * Ambient transaction store. `executor()` returns the ambient tx inside
 * `transaction()` and the root db otherwise, so repositories written
 * against `executor()` automatically participate in the caller's transaction.
 */
const ambientTx = new AsyncLocalStorage<DrizzleDb | DrizzleTx>();

export interface CreateDrizzleDatabaseOptions {
  connectionString: string;
  /** Pool size. Keep small on serverless; prefer the pooled URL. */
  maxConnections?: number;
}

/**
 * Transaction-capable Drizzle adapter over Neon Postgres (UTA-10).
 *
 * Connects with the `pg` driver, which supports interactive transactions
 * against Neon (including pooled URLs). Nested `transaction()` calls join
 * the ambient transaction instead of opening a new one.
 */
export class DrizzleDatabase implements DatabasePort {
  private readonly pool: Pool;
  private readonly db: DrizzleDb;

  constructor(options: CreateDrizzleDatabaseOptions) {
    if (!options.connectionString) {
      throw new Error(
        'DrizzleDatabase requires a connection string (DATABASE_URL / DATABASE_POOL_URL).'
      );
    }
    this.pool = new Pool({
      connectionString: options.connectionString,
      max: options.maxConnections ?? 10,
    });
    this.db = drizzle(this.pool, { schema });
  }

  /**
   * Current query executor. Use this in repositories instead of holding a
   * direct db handle so writes join the ambient transaction when present.
   */
  executor(): DrizzleDb | DrizzleTx {
    return ambientTx.getStore() ?? this.db;
  }

  transaction<T>(fn: () => Promise<T>): Promise<T> {
    const ambient = ambientTx.getStore();
    if (ambient !== undefined) {
      return ambientTx.run(ambient, fn);
    }
    return this.db.transaction((tx) => ambientTx.run(tx, fn));
  }

  async ping(): Promise<void> {
    await this.pool.query('select 1');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** Create a transaction-capable database adapter for the given Postgres URL. */
export function createDatabase(
  options: CreateDrizzleDatabaseOptions
): DrizzleDatabase {
  return new DrizzleDatabase(options);
}
