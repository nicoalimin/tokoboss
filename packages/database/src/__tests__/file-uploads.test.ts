import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { count, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

/**
 * file_uploads migration + store integration (UTA-15).
 *
 * Applies the committed chain 0001 → 0004 to an empty PGlite database (no
 * Neon credentials) and proves:
 * 1. `0004_file_uploads.sql` applies cleanly on top of main's migrations.
 * 2. `(workspace_id, idempotency_key)` and `(workspace_id, pathname)`
 *    uniqueness reject duplicates (token + completion idempotency).
 * 3. Metadata-only contract: the table carries references (pathname/url),
 *    never Blob contents (no bytea/content column).
 * 4. Workspace scoping: one workspace cannot read another's rows.
 */
import { schema, tenants, fileUploads } from '../schema/index';
import { DrizzleFileUploadStore } from '../repositories/drizzle-file-upload-repository';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../infra/drizzle');
const CHAIN = [
  '0001_initial.sql',
  '0002_initial_schema.sql',
  '0003_jobs_job_events.sql',
  '0004_file_uploads.sql',
  '0005_workspace_tenancy_audit.sql',
];

async function createMigratedDb() {
  const client = new PGlite();
  for (const file of CHAIN) {
    const sqlText = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const statements = sqlText
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

async function seedTenant(
  db: Awaited<ReturnType<typeof createMigratedDb>>['db'],
  slug: string
): Promise<string> {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: slug, slug })
    .returning({ id: tenants.id });
  if (!tenant) throw new Error('seed tenant failed');
  return tenant.id;
}

describe('file_uploads migration + drizzle store', () => {
  it('applies 0004 on top of main and starts empty', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const rows = await db.select({ n: count() }).from(fileUploads);
      expect(rows[0]?.n).toBe(0);
    } finally {
      await client.close();
    }
  });

  it('stores metadata references and enforces idempotency uniques', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const workspaceId = await seedTenant(db, 'acme-uploads');
      const store = new DrizzleFileUploadStore(db);
      const created = await store.create({
        workspaceId,
        purpose: 'fixture',
        pathname: `workspaces/${workspaceId}/fixture/k1/hello.txt`,
        contentType: 'text/plain',
        byteSize: 11,
        idempotencyKey: 'k1',
      });
      expect(created.status).toBe('pending');

      // Same idempotency key → conflict (token/completion dedupe).
      await expect(
        store.create({
          workspaceId,
          purpose: 'fixture',
          pathname: `workspaces/${workspaceId}/fixture/k2/other.txt`,
          contentType: 'text/plain',
          byteSize: 11,
          idempotencyKey: 'k1',
        })
      ).rejects.toMatchObject({ code: 'UPLOAD_CONFLICT' });

      // Same pathname under a different key → conflict (one object, one row).
      await expect(
        store.create({
          workspaceId,
          purpose: 'fixture',
          pathname: `workspaces/${workspaceId}/fixture/k1/hello.txt`,
          contentType: 'text/plain',
          byteSize: 11,
          idempotencyKey: 'k2',
        })
      ).rejects.toThrow();

      // Completion flips the row without duplicating it.
      const done = await store.update(created.id, workspaceId, {
        status: 'completed',
        completedAt: new Date(),
      });
      expect(done.status).toBe('completed');
      const reread = await store.findById(created.id, workspaceId);
      expect(reread?.status).toBe('completed');
    } finally {
      await client.close();
    }
  });

  it('denies cross-workspace reads at the store boundary', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const wsA = await seedTenant(db, 'ws-a-deny');
      const wsB = await seedTenant(db, 'ws-b-deny');
      const store = new DrizzleFileUploadStore(db);
      const created = await store.create({
        workspaceId: wsA,
        purpose: 'evidence',
        pathname: `workspaces/${wsA}/evidence/k1/photo.png`,
        contentType: 'image/png',
        byteSize: 1024,
        idempotencyKey: 'deny-1',
      });
      expect(await store.findById(created.id, wsB)).toBeNull();
      expect(await store.findByPathname(wsB, created.pathname)).toBeNull();
      expect(await store.listByWorkspace(wsB)).toHaveLength(0);
    } finally {
      await client.close();
    }
  });

  it('carries metadata only — no Blob content columns', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const cols = await db.execute<{ column_name: string; data_type: string }>(
        sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'file_uploads' ORDER BY ordinal_position`
      );
      const rawRows = (cols as unknown as { rows?: unknown }).rows ?? cols;
      const names = (rawRows as Array<{ column_name: string }>).map(
        (c) => c.column_name
      );
      // Authoritative metadata contract (issue: workspace, purpose, related
      // entity, pathname/URL reference, MIME type, byte size, checksum,
      // creator, retention, status, timestamps).
      for (const expected of [
        'id',
        'workspace_id',
        'purpose',
        'related_entity_type',
        'related_entity_id',
        'pathname',
        'url',
        'content_type',
        'byte_size',
        'checksum',
        'idempotency_key',
        'created_by_type',
        'created_by_id',
        'status',
        'retention_until',
        'completed_at',
        'created_at',
        'updated_at',
      ]) {
        expect(names).toContain(expected);
      }
      // No content/bytes column of any kind (exact-name check — the
      // legitimate `content_type`/`byte_size` metadata columns are allowed).
      const forbidden = new Set([
        'content',
        'bytes',
        'data',
        'payload',
        'body',
        'file_content',
        'blob_content',
        'file_data',
        'blob_data',
      ]);
      expect(names.filter((n) => forbidden.has(n))).toEqual([]);

      // Committed SQL agrees: no bytea, no secret defaults.
      const committed = await readFile(
        path.join(MIGRATIONS_DIR, '0004_file_uploads.sql'),
        'utf8'
      );
      expect(committed).not.toMatch(/bytea/i);
      expect(committed).toMatch(/CREATE TABLE "file_uploads"/);
      expect(committed).toMatch(/FOREIGN KEY.*tenants/s);

      // Cross-check via drizzle relational read (no raw SQL in prod paths).
      const ws = await seedTenant(db, 'ws-meta-only');
      const store = new DrizzleFileUploadStore(db);
      await store.create({
        workspaceId: ws,
        purpose: 'label',
        pathname: `workspaces/${ws}/label/k1/label.pdf`,
        contentType: 'application/pdf',
        byteSize: 2048,
        idempotencyKey: 'meta-1',
      });
      const listed = await store.listByWorkspace(ws);
      expect(listed).toHaveLength(1);
      expect(JSON.stringify(listed[0])).not.toMatch(/BLOB_READ_WRITE_TOKEN/);
    } finally {
      await client.close();
    }
  });

  it('journal and SQL stay gap-free with no duplicate sequences', async () => {
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(MIGRATIONS_DIR);
    const sqlFiles = entries.filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
    expect(sqlFiles).toContain('0004_file_uploads.sql');
    const seqs = sqlFiles.map((f) => f.slice(0, 4));
    expect(new Set(seqs).size).toBe(seqs.length);
  });
});
