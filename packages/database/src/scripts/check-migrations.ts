/**
 * Migration consistency check (UTA-10, no database required).
 *
 * Validates the committed migration history under `infra/drizzle`:
 * - `meta/_journal.json` parses and entries are gap-free from idx 0
 * - every journal entry has a matching `NNNN_name.sql` file (and vice versa)
 * - every SQL file is non-empty and contains schema statements
 * - destructive statements (DROP/TRUNCATE) are flagged for expand/contract review
 *
 * NOTE: this check cannot detect schema edits that were never generated.
 * CI additionally runs `pnpm db:generate` followed by
 * `git diff --exit-code -- infra/drizzle`, so an uncommitted generated
 * migration (schema drift) fails the pipeline.
 *
 * Usage: `pnpm db:check` (cwd must be `packages/database`)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = new URL('../../../../infra/drizzle', import.meta.url);

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

const failures: string[] = [];
const warnings: string[] = [];

function fail(message: string): void {
  failures.push(message);
}

function main(): void {
  let dirEntries: string[];
  try {
    dirEntries = readdirSync(MIGRATIONS_DIR);
  } catch {
    fail(`migrations directory not found: ${MIGRATIONS_DIR}`);
    return report();
  }

  const journalPath = join(MIGRATIONS_DIR.pathname, 'meta', '_journal.json');
  let journal: Journal;
  try {
    journal = JSON.parse(readFileSync(journalPath, 'utf8')) as Journal;
  } catch (error) {
    fail(`cannot parse meta/_journal.json: ${String(error)}`);
    return report();
  }

  if (journal.dialect !== 'postgresql') {
    fail(`unexpected dialect '${journal.dialect}', expected 'postgresql'`);
  }

  const sorted = [...journal.entries].sort((a, b) => a.idx - b.idx);
  const seenIdx = new Set<number>();
  const seenTags = new Set<string>();
  sorted.forEach((entry, position) => {
    if (entry.idx !== position) {
      fail(`journal idx gap: entry at position ${position} has idx ${entry.idx}`);
    }
    if (seenIdx.has(entry.idx)) {
      fail(`duplicate journal idx ${entry.idx}`);
    }
    seenIdx.add(entry.idx);
    if (seenTags.has(entry.tag)) {
      fail(`duplicate journal tag '${entry.tag}'`);
    }
    seenTags.add(entry.tag);

    const expectedFile = `${entry.tag}.sql`;
    const fullPath = join(MIGRATIONS_DIR.pathname, expectedFile);
    try {
      const stat = statSync(fullPath);
      if (stat.size === 0) {
        fail(`migration file is empty: ${expectedFile}`);
      }
    } catch {
      fail(`journal entry idx ${entry.idx} references missing file ${expectedFile}`);
      return;
    }

    const sql = readFileSync(fullPath, 'utf8');
    if (!/CREATE|ALTER/i.test(sql)) {
      fail(`migration file has no schema statements: ${expectedFile}`);
    }
    if (/^\s*(DROP\s+(TABLE|INDEX|COLUMN)|TRUNCATE)\b/im.test(sql)) {
      warnings.push(
        `${expectedFile} contains destructive statements — requires expand/contract review (see infra/drizzle/README.md)`
      );
    }
  });

  const sqlFiles = dirEntries.filter((f) => /^\d{4}_.*\.sql$/.test(f));
  for (const file of sqlFiles) {
    const tag = file.replace(/\.sql$/, '');
    if (!seenTags.has(tag)) {
      fail(`orphan migration file not listed in journal: ${file}`);
    }
  }

  const snapshots = readdirSync(join(MIGRATIONS_DIR.pathname, 'meta')).filter((f) =>
    /^\d+_snapshot\.json$/.test(f)
  );
  if (snapshots.length === 0) {
    fail('no drizzle snapshot found under infra/drizzle/meta');
  }

  report();
}

function report(): void {
  for (const warning of warnings) {
    console.log(`⚠️  ${warning}`);
  }
  if (failures.length > 0) {
    console.error('❌ Migration check failed:');
    for (const failure of failures) {
      console.error(`   - ${failure}`);
    }
    process.exit(1);
  }
  console.log('✅ Migration history is consistent (journal gap-free, SQL files match).');
}

main();
