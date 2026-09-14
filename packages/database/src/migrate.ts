import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { migrate as drizzleMigrate } from 'drizzle-orm/postgres-js/migrator';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';

export const MIGRATION_ADVISORY_LOCK_KEY = 'tokoboss_migrations';

/**
 * Resolve `infra/drizzle` from the repo root regardless of the caller's
 * working directory (`pnpm --filter` runs scripts with cwd = package dir).
 */
export function findMigrationsFolder(startDir: string = process.cwd()): string {
  let dir = path.resolve(startDir);
  while (true) {
    const candidate = path.join(dir, 'infra', 'drizzle');
    if (existsSync(path.join(candidate, 'meta', '_journal.json')))
      return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback preserves the historical default for explicit-override callers.
  return path.resolve(process.cwd(), 'infra/drizzle');
}

export function defaultMigrationsFolder(): string {
  return (
    process.env.DRIZZLE_MIGRATIONS_FOLDER ?? findMigrationsFolder(process.cwd())
  );
}

export const DEFAULT_MIGRATIONS_FOLDER = path.resolve(
  process.cwd(),
  'infra/drizzle'
);

export interface MigrationJournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

export interface MigrationStatus {
  known: string[];
  applied: string[];
  pending: string[];
}

/**
 * Read the committed journal (`infra/drizzle/meta/_journal.json`).
 * This is the source of truth for which migrations exist.
 */
export async function getKnownMigrations(
  migrationsFolderArg?: string
): Promise<string[]> {
  const migrationsFolder = migrationsFolderArg ?? defaultMigrationsFolder();
  const raw = await readFile(
    path.join(migrationsFolder, 'meta', '_journal.json'),
    'utf8'
  );
  const journal = JSON.parse(raw) as { entries: MigrationJournalEntry[] };
  return [...journal.entries].sort((a, b) => a.idx - b.idx).map((e) => e.tag);
}

/**
 * Read applied migrations from the `__drizzle_migrations` history table.
 * Returns `[]` when the table does not exist yet (empty database).
 */
export async function getAppliedMigrations(
  connectionString: string
): Promise<string[]> {
  const client = postgres(connectionString, { max: 1, prepare: false });
  try {
    const rows = await client`
      SELECT hash FROM "__drizzle_migrations" ORDER BY created_at ASC
    `.catch((err: unknown) => {
      if (
        err instanceof Error &&
        'code' in err &&
        (err as { code: string }).code === '42P01'
      ) {
        return [];
      }
      throw err;
    });
    return (rows as Array<{ hash: string }>).map((r) => String(r.hash));
  } finally {
    await client.end({ timeout: 5 });
  }
}

/**
 * Diff known vs applied migrations. Order follows the journal.
 */
export async function getMigrationStatus(
  connectionString: string,
  migrationsFolder?: string
): Promise<MigrationStatus> {
  const known = await getKnownMigrations(migrationsFolder);
  const appliedHashes = new Set(await getAppliedMigrations(connectionString));
  // `__drizzle_migrations.hash` stores the migration folder/tag hash prefix;
  // match by tag containment so status works across drizzle-kit versions.
  const isApplied = (tag: string) =>
    appliedHashes.size > 0 &&
    [...appliedHashes].some((h) => tag.includes(h) || h.includes(tag));
  const applied = known.filter(isApplied);
  const pending = known.filter((t) => !isApplied(t));
  return { known, applied, pending };
}

export interface RunMigrationsOptions {
  migrationsFolder?: string;
  /** Acquire a Postgres advisory lock so concurrent migrators serialize. */
  useAdvisoryLock?: boolean;
}

/**
 * Apply pending migrations. Safe to re-run: when nothing is pending,
 * drizzle reports success without touching the database (apart from
 * the advisory lock + history read).
 */
export async function runMigrations(
  connectionString: string,
  options: RunMigrationsOptions = {}
): Promise<MigrationStatus> {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run migrations.');
  }
  const migrationsFolder =
    options.migrationsFolder ?? defaultMigrationsFolder();
  const useAdvisoryLock = options.useAdvisoryLock ?? true;

  const client = postgres(connectionString, { max: 1, prepare: false });
  try {
    if (useAdvisoryLock) {
      await client`SELECT pg_advisory_lock(hashtext(${MIGRATION_ADVISORY_LOCK_KEY}))`;
    }
    try {
      const { drizzle } = await import('drizzle-orm/postgres-js');
      const { schema } = await import('./schema/index.js');
      const db = drizzle(client, { schema });
      await drizzleMigrate(db, { migrationsFolder });
    } finally {
      if (useAdvisoryLock) {
        await client`SELECT pg_advisory_unlock(hashtext(${MIGRATION_ADVISORY_LOCK_KEY}))`;
      }
    }
  } finally {
    await client.end({ timeout: 10 });
  }
  return getMigrationStatus(connectionString, migrationsFolder);
}

/**
 * One-shot status report used by `db:migrate` CLI output and CI:
 * re-running migrate must print "no pending work".
 */
export function formatMigrationStatus(status: MigrationStatus): string {
  if (status.pending.length === 0) {
    return `Migrations up to date (${status.applied.length}/${status.known.length} applied, no pending work).`;
  }
  return `Pending migrations (${status.pending.length}): ${status.pending.join(', ')}`;
}

/** Escape hatch for tests: acquire/release the migration lock explicitly. */
export async function withMigrationLock<T>(
  connectionString: string,
  fn: (
    query: (
      strings: TemplateStringsArray,
      ...values: unknown[]
    ) => Promise<unknown>
  ) => Promise<T>
): Promise<T> {
  const client = postgres(connectionString, { max: 1, prepare: false });
  try {
    await client`SELECT pg_advisory_lock(hashtext(${MIGRATION_ADVISORY_LOCK_KEY}))`;
    try {
      return await fn(client as never);
    } finally {
      await client`SELECT pg_advisory_unlock(hashtext(${MIGRATION_ADVISORY_LOCK_KEY}))`;
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

export { sql };
