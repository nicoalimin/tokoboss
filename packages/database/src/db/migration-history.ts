import { Client } from 'pg';

/**
 * Migration history entry (one row per applied migration).
 * Backed by drizzle's internal `drizzle.__drizzle_migrations` journal table,
 * which the migrator maintains automatically — the system of record for
 * "what has been applied".
 */
export interface MigrationHistoryEntry {
  hash: string;
  createdAt: number;
}

export interface MigrationHistoryOptions {
  databaseUrl: string;
}

/**
 * List applied migrations in application order.
 * Returns an empty array on an empty database (history table absent).
 */
export async function listAppliedMigrations(
  options: MigrationHistoryOptions
): Promise<MigrationHistoryEntry[]> {
  const client = new Client({
    connectionString: options.databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    try {
      const result = await client.query(
        'SELECT hash, created_at AS "createdAt" FROM "drizzle"."__drizzle_migrations" ORDER BY created_at ASC'
      );
      return result.rows as MigrationHistoryEntry[];
    } catch {
      return [];
    }
  } finally {
    await client.end();
  }
}

/**
 * Count applied migrations. Convenience wrapper for health checks and
 * the "re-running migrate reports no pending work" acceptance criterion.
 */
export async function countAppliedMigrations(
  options: MigrationHistoryOptions
): Promise<number> {
  const entries = await listAppliedMigrations(options);
  return entries.length;
}
