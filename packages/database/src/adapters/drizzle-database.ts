import { neon, neonConfig } from '@neondatabase/serverless';
import {
  drizzle as drizzleNeonHttp,
  type NeonHttpDatabase,
} from 'drizzle-orm/neon-http';
import { count } from 'drizzle-orm';
import type {
  CreateProductInput,
  CreateStockMoveInput,
  CreateStoreInput,
  DatabasePort,
  DatabaseTransaction,
} from '@tokoboss/domain';
import * as schema from '../schema/index.js';

/**
 * Resolve the database URL for the current environment.
 * Preview/local must never silently fall back to production: callers pass
 * the explicit URL for their environment.
 */
export function resolveDatabaseUrl(explicit?: string): string {
  const url =
    explicit ?? process.env.DATABASE_URL ?? process.env.DATABASE_POOL_URL ?? '';
  if (!url) {
    throw new Error(
      'Missing database URL. Set DATABASE_URL (or pass it explicitly). ' +
        'See infra/neon/README.md for per-environment wiring.'
    );
  }
  return url;
}

/** Drizzle client type shared by the adapter (db or tx). */
export type DrizzleClient = NeonHttpDatabase<typeof schema>;

interface Queryable {
  insert: DrizzleClient['insert'];
}

/**
 * Build a `DatabaseTransaction` over any drizzle insert-capable client
 * (either the root `db` or a `tx` inside `db.transaction()`).
 */
function createDrizzleTx(
  client: Queryable,
  countProducts: () => Promise<number>
): DatabaseTransaction {
  return {
    async createStore(input: CreateStoreInput): Promise<void> {
      await client
        .insert(schema.stores)
        .values({ id: input.id, name: input.name });
    },
    async createProduct(input: CreateProductInput): Promise<void> {
      await client.insert(schema.products).values({
        id: input.id,
        storeId: input.storeId,
        sku: input.sku,
        name: input.name,
        priceCents: input.priceCents,
      });
    },
    async createStockMove(input: CreateStockMoveInput): Promise<void> {
      await client.insert(schema.stockMoves).values({
        id: input.id,
        productId: input.productId,
        qty: input.qty,
        reason: input.reason,
      });
    },
    async countProducts(): Promise<number> {
      return countProducts();
    },
  };
}

/**
 * Drizzle + Neon Postgres `DatabasePort` implementation.
 *
 * - Uses the Neon serverless HTTP driver (edge-compatible, transaction-capable
 *   via Neon's HTTP transaction support).
 * - `withTransaction` delegates to `db.transaction()`: all writes in `fn`
 *   commit atomically or roll back on error.
 */
export class DrizzleDatabase implements DatabasePort {
  private readonly db: DrizzleClient;

  constructor(databaseUrl?: string) {
    const url = resolveDatabaseUrl(databaseUrl);
    neonConfig.fetchConnectionCache = true;
    const sql = neon(url);
    this.db = drizzleNeonHttp(sql, { schema });
  }

  /** Direct drizzle client escape hatch for repositories (same schema). */
  get client(): DrizzleClient {
    return this.db;
  }

  async withTransaction<T>(
    fn: (tx: DatabaseTransaction) => Promise<T>
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      const countProducts = async (): Promise<number> => {
        const rows = await tx.select({ value: count() }).from(schema.products);
        return rows[0]?.value ?? 0;
      };
      return fn(createDrizzleTx(tx, countProducts));
    });
  }

  async ping(): Promise<void> {
    await this.db.select({ value: count() }).from(schema.stores);
  }
}

/**
 * Generic transaction wrapper: runs `fn` inside the port's transaction.
 * Thin alias kept for ergonomic imports (`withTransaction(db, fn)`).
 */
export async function withTransaction<T>(
  db: DatabasePort,
  fn: (tx: DatabaseTransaction) => Promise<T>
): Promise<T> {
  return db.withTransaction(fn);
}
