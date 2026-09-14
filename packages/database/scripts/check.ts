/**
 * `pnpm db:check` — CI gate: fail on schema drift or uncommitted migrations.
 *
 * 1. Verifies the committed journal matches the SQL files on disk
 *    (missing/extra files, duplicate sequences fail).
 * 2. Verifies `git status` for `infra/drizzle` is clean (any uncommitted
 *    generated file fails).
 *
 * Full SQL-level drift detection (`drizzle-kit check`) also runs via the
 * `db:check:kit` script.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

function findRepoRoot(startDir: string = process.cwd()): string {
  let dir = path.resolve(startDir);
  while (true) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(startDir);
    dir = parent;
  }
}

function gitClean(root: string, paths: string[]): boolean {
  try {
    const out = execSync(
      'git status --porcelain -- ' + paths.map((p) => `"${p}"`).join(' '),
      {
        cwd: root,
        encoding: 'utf8',
      }
    );
    if (out.trim().length > 0) {
      console.error('Uncommitted migration files detected:\n' + out);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Failed to inspect git status:', err);
    return false;
  }
}

async function main(): Promise<void> {
  const root = process.env.WORKSPACE_ROOT ?? findRepoRoot(process.cwd());
  const migrationsDir = path.join(root, 'infra/drizzle');

  const entries = await readdir(migrationsDir);
  const sqlFiles = entries.filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  const raw = await readFile(
    path.join(migrationsDir, 'meta', '_journal.json'),
    'utf8'
  );
  const journal = JSON.parse(raw) as {
    entries: Array<{ idx: number; tag: string }>;
  };
  const journalTags = journal.entries.map((e) => `${e.tag}.sql`).sort();

  let ok = true;

  // Journal idx must be 0..n-1 in order (drizzle-kit convention). A gap or
  // 1-based start breaks future `generate` sequencing and the AGENTS.md
  // gap-free rule, so fail here instead of shipping a permanent wart.
  const ordered = [...journal.entries].sort((a, b) => a.idx - b.idx);
  ordered.forEach((entry, position) => {
    if (entry.idx !== position) {
      console.error(
        `Journal idx gap/dupe: position ${position} has idx=${entry.idx} (tag=${entry.tag}). Fix meta/_journal.json (branch entries move after main; never renumber main).`
      );
      ok = false;
    }
    const expectedFile = `${entry.tag}.sql`;
    if (!sqlFiles.includes(expectedFile)) {
      console.error(
        `Journal entry idx=${entry.idx} (tag=${entry.tag}) expects file ${expectedFile}, which is missing or misnamed.`
      );
      ok = false;
    }
    // drizzle-kit names tags `NNNN_name` with NNNN == idx+1; enforce the
    // coupling so renumbering mistakes (AGENTS.md rebase rule) fail fast.
    const expectedPrefix = String(entry.idx + 1).padStart(4, '0');
    if (!entry.tag.startsWith(`${expectedPrefix}_`)) {
      console.error(
        `Journal entry idx=${entry.idx} has tag=${entry.tag}, expected prefix ${expectedPrefix}_ (tag sequence must match idx+1).`
      );
      ok = false;
    }
  });
  if (new Set(journal.entries.map((e) => e.tag)).size !== journal.entries.length) {
    console.error('Journal has duplicate tags — each migration tag must be unique.');
    ok = false;
  }

  const missing = sqlFiles.filter((f) => !journalTags.includes(f));
  const extra = journalTags.filter((f) => !sqlFiles.includes(f));
  if (missing.length > 0) {
    console.error(`Migration SQL without journal entry: ${missing.join(', ')}`);
    ok = false;
  }
  if (extra.length > 0) {
    console.error(`Journal entries without SQL file: ${extra.join(', ')}`);
    ok = false;
  }

  // Duplicate sequence numbers break deploys (see AGENTS.md rebase rule).
  const seqs = sqlFiles.map((f) => f.slice(0, 4));
  if (new Set(seqs).size !== seqs.length) {
    console.error(
      `Duplicate migration sequence numbers: ${sqlFiles.join(', ')}`
    );
    ok = false;
  }

  // Only migration artefacts gate the pipeline — docs (README.md) and setup
  // notes may change freely without tripping the check.
  if (!gitClean(root, ['infra/drizzle/*.sql', 'infra/drizzle/meta'])) {
    console.error(
      'Commit generated migrations before pushing (generate → review → commit).'
    );
    ok = false;
  }

  if (!ok) {
    console.error('db:check FAILED: schema drift or uncommitted migration.');
    process.exit(1);
  }
  console.log(
    `db:check OK: ${sqlFiles.length} migration(s), journal in sync, working tree clean.`
  );
}

main().catch((err) => {
  console.error('db:check FAILED:', err);
  process.exit(1);
});
