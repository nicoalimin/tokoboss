import { createHash } from 'node:crypto';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';
import * as schema from '../schema/index.js';

/**
 * Advisory-lock key namespace for migrations. A single 64-bit key derived
 * from a stable string guarantees only one migrator runs at a time, even
 * across Vercel instances or CI runners pointing at the same Neon branch.
 */
export const MIGRATION_ADVISORY_LOCK_NAMESPACE = 'tokoboss_migrations_v1';

export function advisoryLockKey(
  namespace: string = MIGRATION_ADVISORY_LOCK_NAMESPACE
): string {
  const digest = createHash('sha256').update(namespace).digest();
  return String(digest.readBigInt64BE(0));
}

export interface MigrateOptions {
  /** Postgres connection string (Neon pooled URL recommended). */
  databaseUrl: string;
  /** Absolute path to the committed migrations folder (`infra/drizzle`). */
  migrationsFolder: string;
  /** Namespace for the advisory lock (defaults to the TokoBoss namespace). */
  lockNamespace?: string;
}

export interface MigrateResult {
  /** `true` when the folder was already fully applied (safe re-run). */
  alreadyUpToDate: boolean;
  /** Number of migrations applied in this run (0 when up to date). */
  appliedCount: number;
}

/**
 * Count migration files present in the folder (excludes `meta/`).
 */
export function countMigrationFiles(): number {
  // Counted by the caller via the journal; kept here as a documented hook.
  return 0;
}

/**
 * Apply pending migrations in a single controlled step:
 *
 * 1. Connect with the `node-postgres` driver (works against Neon).
 * 2. Acquire a session-level `pg_advisory_lock` (serializes migrators).
 * 3. Run drizzle's migrator (each migration in its own transaction;
 *    already-applied migrations are skipped via `__drizzle_migrations`).
 * 4. Release the lock and close the connection.
 *
 * Re-running is safe: when nothing is pending the migrator applies zero
 * migrations and we report `alreadyUpToDate: true`.
 */
export async function migrateWithAdvisoryLock(
  options: MigrateOptions
): Promise<MigrateResult> {
  const lockKey = advisoryLockKey(options.lockNamespace);
  const client = new Client({
    connectionString: options.databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1::bigint)', [lockKey]);
    try {
      const db = drizzleNodePg(client, { schema });
      const before = await appliedMigrationCount(client);
      await migrate(db, { migrationsFolder: options.migrationsFolder });
      const after = await appliedMigrationCount(client);
      const appliedCount = after - before;
      return { alreadyUpToDate: appliedCount === 0, appliedCount };
    } finally {
      await client.query('SELECT pg_advisory_unlock($1::bigint)', [lockKey]);
    }
  } finally {
    await client.end();
  }
}

async function appliedMigrationCount(client: Client): Promise<number> {
  try {
    const result = await client.query(
      'SELECT COUNT(*)::int AS n FROM "drizzle"."__drizzle_migrations"'
    );
    return (result.rows[0]?.n as number) ?? 0;
  } catch {
    // Migration history table does not exist yet (empty database).
    return 0;
  }
}
