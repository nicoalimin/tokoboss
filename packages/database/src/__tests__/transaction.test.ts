import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { count, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

/**
 * Transaction integration test through the database port.
 *
 * Uses in-memory PGlite (no Neon credentials, no production data) to prove:
 * 1. The reviewed initial migration applies to an empty database.
 * 2. A multi-table unit of work commits atomically via the
 *    `DrizzleTenantRepository` (domain `Repository` port).
 * 3. A failing unit of work rolls back (nothing visible afterwards).
 * 4. The synthetic seed is idempotent and writes synthetic-only rows.
 *
 * Migrator-level re-run safety comes from drizzle's `drizzle.__drizzle_migrations`
 * history table (see `getMigrationStatus`); the CLI reports "no pending work".
 */
import { auditEvents, schema, tenants } from '../schema/index';
import { DrizzleTenantRepository } from '../repositories/drizzle-tenant-repository';
import { insertSyntheticSeed } from '../seed';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../infra/drizzle');

// Full committed chain in journal order — mirrors a real deploy. UTA-19
// appends 0005 (workspace_members + audit actor columns); the repository
// port reads/writes the current schema so the harness must too.
const CHAIN = [
  '0001_initial.sql',
  '0002_initial_schema.sql',
  '0003_jobs_job_events.sql',
  '0004_file_uploads.sql',
  '0005_workspace_tenancy_audit.sql',
];

async function createMigratedDb() {
  const client = new PGlite();
  // NOTE: no `CREATE EXTENSION "pgcrypto"` — PGlite builds do not ship it,
  // and `gen_random_uuid()` is built into modern Postgres core (Neon included).
  for (const file of CHAIN) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    // Split the reviewed migration into statements (drizzle splits on `--> statement-breakpoint`).
    const statements = sql
      .split(/-->\s*statement-breakpoint/g)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await client.exec(stmt);
    }
  }
  const db = drizzle(client, { schema });
  return { client, db };
}

describe('transaction integration (database port)', () => {
  it('applies the initial migration to an empty database', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const t = await db.select({ n: count() }).from(tenants);
      const a = await db.select({ n: count() }).from(auditEvents);
      expect(t[0]?.n).toBe(0);
      expect(a[0]?.n).toBe(0);
    } finally {
      await client.close();
    }
  });

  it('commits tenant + audit event atomically through the repository port', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const repo = new DrizzleTenantRepository(db);
      const created = await db.transaction(async (tx) =>
        new DrizzleTenantRepository(tx).createWithAuditEvent(
          { name: 'Acme', slug: 'acme' },
          { action: 'tenant.created', payload: { synthetic: true } }
        )
      );

      expect(created.slug).toBe('acme');
      expect(await repo.findById(created.id)).toMatchObject({ slug: 'acme' });
      const events = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.tenantId, created.id));
      expect(events).toHaveLength(1);
      expect(events[0]?.action).toBe('tenant.created');
    } finally {
      await client.close();
    }
  });

  it('rolls back the whole unit of work on failure', async () => {
    const { client, db } = await createMigratedDb();
    try {
      await expect(
        db.transaction(async (tx) => {
          const repo = new DrizzleTenantRepository(tx);
          await repo.createWithAuditEvent(
            { name: 'Doomed', slug: 'doomed' },
            { action: 'tenant.created' }
          );
          throw new Error('simulated failure');
        })
      ).rejects.toThrow('simulated failure');

      const repo = new DrizzleTenantRepository(db);
      expect(await repo.findBySlug('doomed')).toBeNull();
      expect(await db.select().from(auditEvents)).toHaveLength(0);
    } finally {
      await client.close();
    }
  });

  it('synthetic seed is idempotent and writes no production data', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const first = await db.transaction((tx) =>
        insertSyntheticSeed(tx, { tenantCount: 2 })
      );
      expect(first.tenantsCreated).toBe(2);
      expect(first.auditEventsCreated).toBe(2);

      const second = await db.transaction((tx) =>
        insertSyntheticSeed(tx, { tenantCount: 2 })
      );
      expect(second.tenantsCreated).toBe(0);
      expect(second.slugs).toEqual(first.slugs);
      expect(second.slugs.every((s) => s.startsWith('synthetic-tenant-'))).toBe(
        true
      );
    } finally {
      await client.close();
    }
  });
});
