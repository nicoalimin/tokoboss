import { describe, expect, it } from 'vitest';

/**
 * Guardrails that do not need a database:
 * - production seed refusal (no prod data/credentials in tests or seeds)
 * - migration status formatting (re-run reports no pending work)
 * - committed journal/SQL consistency (drift fails CI)
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  diffMigrationHashes,
  formatMigrationStatus,
  getMigrationFileHash,
} from '../migrate.js';
import { assertSeedAllowed } from '../seed.js';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../infra/drizzle');

describe('seed guardrails', () => {
  it('refuses to seed production without explicit opt-in', () => {
    expect(() => assertSeedAllowed('production')).toThrow(/Refusing to seed/);
  });

  it('allows non-production seeds', () => {
    expect(() => assertSeedAllowed('local')).not.toThrow();
    expect(() => assertSeedAllowed('preview')).not.toThrow();
    expect(() => assertSeedAllowed('staging')).not.toThrow();
  });
});

describe('migration status reporting', () => {
  it('reports no pending work when converged', () => {
    expect(
      formatMigrationStatus({
        known: ['0001_initial'],
        applied: ['0001_initial'],
        pending: [],
      })
    ).toMatch(/no pending work/);
  });

  it('lists pending migrations otherwise', () => {
    expect(
      formatMigrationStatus({
        known: ['0001_initial'],
        applied: [],
        pending: ['0001_initial'],
      })
    ).toMatch(/Pending migrations/);
  });
});

describe('migration content hashes (status truthfulness)', () => {
  it('hashes the committed file deterministically (sha256 hex)', async () => {
    const first = await getMigrationFileHash('0001_initial', MIGRATIONS_DIR);
    const second = await getMigrationFileHash('0001_initial', MIGRATIONS_DIR);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toBe(first);
  });

  it('agrees with the hash drizzle itself records in history', async () => {
    // getMigrationStatus must match what the migrator writes to
    // drizzle.__drizzle_migrations, otherwise a successful migrate would
    // falsely report pending work. Compare against drizzle's own reader.
    const { readMigrationFiles } = await import('drizzle-orm/migrator');
    const [entry] = readMigrationFiles({ migrationsFolder: MIGRATIONS_DIR });
    expect(entry).toBeDefined();
    await expect(
      getMigrationFileHash('0001_initial', MIGRATIONS_DIR)
    ).resolves.toBe(entry?.hash);
  });

  it('diffs applied vs pending by content hash, not tag', () => {
    const known = [
      { tag: '0001_initial', hash: 'aaa' },
      { tag: '0002_add_x', hash: 'bbb' },
    ];
    expect(diffMigrationHashes(known, ['aaa', 'bbb']).pending).toEqual([]);
    expect(diffMigrationHashes(known, ['aaa']).pending).toEqual(['0002_add_x']);
    // Same tag, different content (edited after apply) → pending again.
    expect(
      diffMigrationHashes([{ tag: '0001_initial', hash: 'changed' }], ['aaa'])
        .pending
    ).toEqual(['0001_initial']);
  });
});

describe('committed migration artefacts', () => {
  it('journal matches SQL files with no duplicate sequences', async () => {
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(MIGRATIONS_DIR);
    const sqlFiles = entries.filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
    expect(sqlFiles.length).toBeGreaterThan(0);

    const raw = await readFile(
      path.join(MIGRATIONS_DIR, 'meta', '_journal.json'),
      'utf8'
    );
    const journal = JSON.parse(raw) as { entries: Array<{ tag: string }> };
    const journalFiles = journal.entries.map((e) => `${e.tag}.sql`).sort();
    expect(journalFiles).toEqual(sqlFiles);

    const seqs = sqlFiles.map((f) => f.slice(0, 4));
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('initial migration creates the contracted tables', async () => {
    const sql = await readFile(
      path.join(MIGRATIONS_DIR, '0001_initial.sql'),
      'utf8'
    );
    expect(sql).toMatch(/CREATE TABLE.*"tenants"/);
    expect(sql).toMatch(/CREATE TABLE.*"audit_events"/);
    // UUID/UTC conventions
    expect(sql).toMatch(/uuid/i);
    expect(sql).toMatch(/timestamp with time zone/i);
    // FK helper convention
    expect(sql).toMatch(/FOREIGN KEY.*tenants/s);
  });
});
