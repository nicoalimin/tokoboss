import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { count, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

/**
 * Jobs migration + store integration (UTA-14).
 *
 * Applies the committed chain 0001 → 0002 → 0003 to an empty PGlite
 * database (no Neon credentials) and proves:
 * 1. `0003_jobs_job_events.sql` applies cleanly on top of main's migrations.
 * 2. `(workspace_id, idempotency_key)` uniqueness rejects duplicates.
 * 3. Job row + `queued` event commit atomically; failures roll back.
 * 4. Events read back oldest-first; stranded query finds undispatched work.
 */
import {
  cancelJob,
  claimStartJob,
  completeJob,
  createJob,
  readJobTimeline,
  type JobStore,
} from '@tokoboss/application';
import { schema, tenants, jobEvents, jobs } from '../schema/index';
import {
  DrizzleJobStore,
  drizzleJobTxRunner,
} from '../repositories/drizzle-job-repository';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../infra/drizzle');
const CHAIN = [
  '0001_initial.sql',
  '0002_initial_schema.sql',
  '0003_jobs_job_events.sql',
];

async function createMigratedDb() {
  const client = new PGlite();
  for (const file of CHAIN) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
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

describe('jobs migration + drizzle store', () => {
  it('applies 0003 on top of main and starts empty', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const j = await db.select({ n: count() }).from(jobs);
      const e = await db.select({ n: count() }).from(jobEvents);
      expect(j[0]?.n).toBe(0);
      expect(e[0]?.n).toBe(0);
    } finally {
      await client.close();
    }
  });

  it('creates job + queued event atomically with workspace tenancy', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const [tenant] = await db
        .insert(tenants)
        .values({ name: 'Acme', slug: 'acme-jobs' })
        .returning({ id: tenants.id });
      if (!tenant) throw new Error('seed tenant failed');
      const tx = drizzleJobTxRunner({
        withTransaction: <T>(fn: (t: never) => Promise<T>): Promise<T> =>
          (db.transaction as (f: (t: never) => Promise<T>) => Promise<T>)(fn),
      });

      const { job, duplicate } = await createJob(tx, {
        workspaceId: tenant.id,
        type: 'hello',
        idempotencyKey: 'biz-pg-1',
        inputRef: { greeting: 'hello' },
      });
      expect(duplicate).toBe(false);
      expect(job.status).toBe('queued');

      // Idempotent repeat resolves to the same row, no new events.
      const again = await createJob(tx, {
        workspaceId: tenant.id,
        type: 'hello',
        idempotencyKey: 'biz-pg-1',
      });
      expect(again.duplicate).toBe(true);
      expect(again.job.id).toBe(job.id);

      const store: JobStore = new DrizzleJobStore(db);
      const { events } = await readJobTimeline(store, {
        jobId: job.id,
        workspaceId: tenant.id,
      });
      expect(events.map((e) => e.type)).toEqual(['queued']);
    } finally {
      await client.close();
    }
  });

  it('unique (workspace, idempotency_key) rejects cross-call duplicates', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const [tenant] = await db
        .insert(tenants)
        .values({ name: 'Acme', slug: 'acme-uniq' })
        .returning({ id: tenants.id });
      if (!tenant) throw new Error('seed tenant failed');
      const store = new DrizzleJobStore(db);
      await store.create({
        workspaceId: tenant.id,
        type: 'hello',
        idempotencyKey: 'biz-dup',
      });
      await expect(
        store.create({
          workspaceId: tenant.id,
          type: 'hello',
          idempotencyKey: 'biz-dup',
        })
      ).rejects.toMatchObject({ code: 'JOB_CONFLICT' });
    } finally {
      await client.close();
    }
  });

  it('rolls back job + event together on failure', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const [tenant] = await db
        .insert(tenants)
        .values({ name: 'Doomed', slug: 'doomed-jobs' })
        .returning({ id: tenants.id });
      if (!tenant) throw new Error('seed tenant failed');
      await expect(
        db.transaction(async (tx) => {
          const store = new DrizzleJobStore(tx);
          await store.create({
            workspaceId: tenant.id,
            type: 'hello',
            idempotencyKey: 'biz-doomed',
          });
          await store.appendEvent('job_missing', tenant.id, 'queued', 0);
        })
      ).rejects.toThrow();
      const rows = await db
        .select()
        .from(jobs)
        .where(eq(jobs.workspaceId, tenant.id));
      expect(rows).toHaveLength(0);
    } finally {
      await client.close();
    }
  });

  it('full lifecycle persists with ordered events and stranded semantics', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const [tenant] = await db
        .insert(tenants)
        .values({ name: 'Acme', slug: 'acme-life' })
        .returning({ id: tenants.id });
      if (!tenant) throw new Error('seed tenant failed');
      const tx = drizzleJobTxRunner({
        withTransaction: <T>(fn: (t: never) => Promise<T>): Promise<T> =>
          (db.transaction as (f: (t: never) => Promise<T>) => Promise<T>)(fn),
      });
      const store: JobStore = new DrizzleJobStore(db);

      // Undispatched job is stranded.
      const { job: stranded } = await createJob(tx, {
        workspaceId: tenant.id,
        type: 'hello',
        idempotencyKey: 'biz-stranded-pg',
      });
      expect(
        await store.findStranded({ retryDueBefore: new Date(), limit: 10 })
      ).toHaveLength(1);

      // Full lifecycle to completed.
      const { job: created } = await createJob(tx, {
        workspaceId: tenant.id,
        type: 'hello',
        idempotencyKey: 'biz-life-pg',
      });
      await claimStartJob(store, {
        jobId: created.id,
        workspaceId: tenant.id,
        workflowRunId: 'run_pg_1',
      });
      await completeJob(store, {
        jobId: created.id,
        workspaceId: tenant.id,
        outputRef: { greeting: 'hello' },
      });
      const { job: done, events } = await readJobTimeline(store, {
        jobId: created.id,
        workspaceId: tenant.id,
      });
      expect(done.status).toBe('completed');
      expect(events.map((e) => e.type)).toEqual([
        'queued',
        'started',
        'completed',
      ]);

      // Completed job is not stranded; undispatched one still is.
      const remaining = await store.findStranded({
        retryDueBefore: new Date(),
        limit: 10,
      });
      expect(remaining.map((j) => j.id)).toEqual([stranded.id]);

      // Safe-cancel checkpoint enforced at the Postgres layer too.
      await expect(
        cancelJob(store, { jobId: created.id, workspaceId: tenant.id })
      ).rejects.toMatchObject({ code: 'JOB_INVALID_TRANSITION' });
    } finally {
      await client.close();
    }
  });
});
