import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate as drizzleMigrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { schema } from './schema/index.js';

export const MIGRATION_ADVISORY_LOCK_KEY = 'tokoboss_migrations';
/** History table written by the drizzle migrator (schema-qualified). */
export const MIGRATIONS_SCHEMA = 'drizzle';
export const MIGRATIONS_TABLE = '__drizzle_migrations';

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
  // Fallback: callers can always override via DRIZZLE_MIGRATIONS_FOLDER.
  return path.resolve(process.cwd(), 'infra/drizzle');
}

export function defaultMigrationsFolder(): string {
  return (
    process.env.DRIZZLE_MIGRATIONS_FOLDER ?? findMigrationsFolder(process.cwd())
  );
}

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
  migrationsFolder?: string
): Promise<string[]> {
  const folder = migrationsFolder ?? defaultMigrationsFolder();
  const raw = await readFile(
    path.join(folder, 'meta', '_journal.json'),
    'utf8'
  );
  const journal = JSON.parse(raw) as { entries: MigrationJournalEntry[] };
  return [...journal.entries].sort((a, b) => a.idx - b.idx).map((e) => e.tag);
}

/**
 * Read applied migration hashes from the `drizzle.__drizzle_migrations`
 * history table. Returns `[]` when the table (or its schema) does not exist
 * yet, i.e. an empty database.
 */
export async function getAppliedMigrations(
  connectionString: string
): Promise<string[]> {
  const client = postgres(connectionString, { max: 1, prepare: false });
  try {
    const rows = await client`
      SELECT hash FROM "drizzle"."__drizzle_migrations" ORDER BY created_at ASC
    `.catch((err: unknown) => {
      if (
        err instanceof Error &&
        'code' in err &&
        ((err as { code: string }).code === '42P01' ||
          (err as { code: string }).code === '3F000')
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
 * Content hash of a committed migration file. Mirrors drizzle's own
 * `readMigrationFiles` (`sha256` over the full file text), so status diffs
 * agree with what the migrator records — and a modified-after-apply file
 * shows up as pending again instead of silently passing.
 */
export async function getMigrationFileHash(
  tag: string,
  migrationsFolder: string
): Promise<string> {
  const sqlText = await readFile(
    path.join(migrationsFolder, `${tag}.sql`),
    'utf8'
  );
  return createHash('sha256').update(sqlText).digest('hex');
}

/**
 * Diff known vs applied migrations. Order follows the journal.
 */
export async function getMigrationStatus(
  connectionString: string,
  migrationsFolder?: string
): Promise<MigrationStatus> {
  const folder = migrationsFolder ?? defaultMigrationsFolder();
  const known = await getKnownMigrations(folder);
  const appliedHashes = await getAppliedMigrations(connectionString);
  const withHashes = [];
  for (const tag of known) {
    withHashes.push({ tag, hash: await getMigrationFileHash(tag, folder) });
  }
  return diffMigrationHashes(withHashes, appliedHashes);
}

/** Pure diff over journal tags + file hashes (unit-testable, no database). */
export function diffMigrationHashes(
  known: Array<{ tag: string; hash: string }>,
  appliedHashes: Set<string> | string[]
): MigrationStatus {
  const appliedSet =
    appliedHashes instanceof Set ? appliedHashes : new Set(appliedHashes);
  const applied = known.filter((m) => appliedSet.has(m.hash)).map((m) => m.tag);
  const pending = known
    .filter((m) => !appliedSet.has(m.hash))
    .map((m) => m.tag);
  return { known: known.map((m) => m.tag), applied, pending };
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
