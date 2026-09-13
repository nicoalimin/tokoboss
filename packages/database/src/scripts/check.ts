#!/usr/bin/env tsx
/**
 * Migration consistency check — runs in CI (`db:check`).
 *
 * Fails CI when:
 * 1. `infra/drizzle/meta/_journal.json` is internally inconsistent
 *    (missing files, extra files, non-sequential idx, duplicate sequence numbers).
 * 2. The journal references migration files absent from disk (or vice versa).
 * 3. The working tree has uncommitted changes under `infra/drizzle/`
 *    (an uncommitted generated migration must fail CI).
 * 4. The TypeScript schema snapshot drifts from expectations
 *    (expected tables/columns missing).
 *
 * Full live-database drift detection (schema vs. Neon branch) happens in
 * preview deploys (UTA-11); this check guards the committed-artifact half.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from '../schema/index.js';

const DRIZZLE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../infra/drizzle'
);

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

let failures = 0;

function fail(message: string): void {
  failures += 1;
  console.error(`[db:check] FAIL: ${message}`);
}

function ok(message: string): void {
  console.log(`[db:check] ok: ${message}`);
}

function checkJournal(): void {
  const journalPath = path.join(DRIZZLE_DIR, 'meta', '_journal.json');
  if (!fs.existsSync(journalPath)) {
    fail(`missing journal at ${journalPath}`);
    return;
  }
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as Journal;

  const seenIdx = new Set<number>();
  const seenSeq = new Set<string>();
  for (const entry of journal.entries) {
    if (seenIdx.has(entry.idx)) {
      fail(`duplicate journal idx ${entry.idx}`);
    }
    seenIdx.add(entry.idx);

    const seq = entry.tag.split('_')[0];
    if (!seq || !/^\d+$/.test(seq)) {
      fail(`entry tag "${entry.tag}" does not start with a numeric sequence`);
      continue;
    }
    if (seenSeq.has(seq)) {
      fail(`duplicate migration sequence number ${seq} (tag "${entry.tag}")`);
    }
    seenSeq.add(seq);

    const sqlFile = path.join(DRIZZLE_DIR, `${entry.tag}.sql`);
    if (!fs.existsSync(sqlFile)) {
      fail(`journal entry "${entry.tag}" has no SQL file on disk`);
    }
  }

  const idxs = [...seenIdx].sort((a, b) => a - b);
  for (let i = 0; i < idxs.length; i += 1) {
    if (idxs[i] !== i) {
      fail(
        `journal idx gap: expected ${i}, found ${idxs[i] ?? 'nothing'} (gap-free sequence required)`
      );
      break;
    }
  }

  // Every *.sql file must be referenced by the journal (no orphan migrations).
  const sqlFiles = fs
    .readdirSync(DRIZZLE_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => f.replace(/\.sql$/, ''))
    .sort();
  const journalTags = new Set(journal.entries.map((e) => e.tag));
  for (const file of sqlFiles) {
    if (!journalTags.has(file)) {
      fail(`orphan migration file "${file}.sql" not referenced by the journal`);
    }
  }

  if (failures === 0) {
    ok(
      `journal integrity: ${journal.entries.length} entr(ies), gap-free, no duplicates`
    );
  }
}

function checkCleanTree(): void {
  try {
    const output = execSync('git status --porcelain -- infra/drizzle', {
      encoding: 'utf8',
      cwd: path.resolve(DRIZZLE_DIR, '..', '..'),
    }).trim();
    if (output) {
      fail(`uncommitted changes under infra/drizzle/:\n${output}`);
    } else {
      ok(
        'infra/drizzle/ working tree is clean (no uncommitted generated migration)'
      );
    }
  } catch {
    // Not a git checkout (e.g. tarball CI): skip, journal check still applies.
    console.log('[db:check] skip: git not available for clean-tree check');
  }
}

function checkSchemaSnapshot(): void {
  const expectations: Array<{ table: string; columns: string[] }> = [
    { table: 'stores', columns: ['id', 'name', 'created_at', 'updated_at'] },
    {
      table: 'products',
      columns: [
        'id',
        'store_id',
        'sku',
        'name',
        'price_cents',
        'created_at',
        'updated_at',
      ],
    },
    {
      table: 'stock_moves',
      columns: ['id', 'product_id', 'qty', 'reason', 'created_at'],
    },
  ];

  const tables: Record<
    string,
    Record<string, unknown>
  > = schema as unknown as Record<string, Record<string, unknown>>;
  for (const { table, columns } of expectations) {
    const foundKey = Object.keys(tables).find(
      (k) => k.toLowerCase().replace(/_/g, '') === table.replace(/_/g, '')
    );
    if (!foundKey) {
      fail(`schema snapshot: expected table export for "${table}"`);
      continue;
    }
    const drizzleTable = tables[foundKey];
    if (typeof drizzleTable !== 'object' || drizzleTable === null) {
      fail(`schema snapshot: export "${foundKey}" is not a table object`);
      continue;
    }
    // Drizzle table objects expose columns as properties using the
    // camelCase keys from the schema definition (e.g. `storeId`).
    const toCamel = (col: string): string =>
      col.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    const missing = columns.filter(
      (col) => !(col in drizzleTable) && !(toCamel(col) in drizzleTable)
    );
    if (missing.length > 0) {
      fail(
        `schema snapshot: table "${table}" missing column(s): ${missing.join(', ')}`
      );
    } else {
      ok(
        `schema snapshot: table "${table}" present (${columns.length} expected columns)`
      );
    }
  }
}

checkJournal();
checkCleanTree();
checkSchemaSnapshot();

if (failures > 0) {
  console.error(`[db:check] ${failures} failure(s).`);
  process.exit(1);
}
console.log('[db:check] all migration consistency checks passed.');
