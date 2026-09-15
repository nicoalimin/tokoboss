import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { count, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

/**
 * Workspace tenancy + audit baseline migration + store integration (UTA-19).
 *
 * Applies the committed chain 0001 → 0005 to an empty PGlite database (no
 * Neon credentials) and proves:
 * 1. `0005_workspace_tenancy_audit.sql` applies cleanly on top of main's
 *    migrations (workspace_members + audit actor columns, additive only).
 * 2. `(workspace_id, user_id)` uniqueness rejects duplicate memberships.
 * 3. Store reads are workspace-scoped (cross-workspace returns null).
 * 4. The audit sink persists membership/security rows with actor/category
 *    columns and opaque-ids-only payloads (no secrets/PII).
 */
import { auditEvents, schema, tenants } from '../schema/index';
import {
  DrizzleTenancyAuditSink,
  DrizzleWorkspaceMemberStore,
} from '../repositories/drizzle-workspace-member-repository';

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

describe('workspace tenancy migration + drizzle stores', () => {
  it('applies 0005 on top of main and starts empty', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const ws = await seedTenant(db, 'acme-tenancy');
      const store = new DrizzleWorkspaceMemberStore(db);
      expect(await store.listByWorkspace(ws)).toHaveLength(0);
      const events = await db.select({ n: count() }).from(auditEvents);
      expect(events[0]?.n).toBe(0);
    } finally {
      await client.close();
    }
  });

  it('enforces (workspace_id, user_id) uniqueness', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const ws = await seedTenant(db, 'acme-unique');
      const store = new DrizzleWorkspaceMemberStore(db);
      await store.create({
        workspaceId: ws,
        userId: 'user_1',
        role: 'admin',
        warehouseScope: null,
        status: 'active',
      });
      await expect(
        store.create({
          workspaceId: ws,
          userId: 'user_1',
          role: 'staff',
          warehouseScope: null,
          status: 'active',
        })
      ).rejects.toThrow(/MEMBERSHIP_CONFLICT/);
    } finally {
      await client.close();
    }
  });

  it('denies cross-workspace reads at the store boundary', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const wsA = await seedTenant(db, 'acme-ws-a');
      const wsB = await seedTenant(db, 'acme-ws-b');
      const store = new DrizzleWorkspaceMemberStore(db);
      await store.create({
        workspaceId: wsA,
        userId: 'user_1',
        role: 'staff',
        warehouseScope: null,
        status: 'active',
      });
      // Same user id, other workspace → null (use-cases map this to deny).
      expect(await store.findByWorkspaceAndUser(wsB, 'user_1')).toBeNull();
      expect(
        await store.findByWorkspaceAndUser(wsA, 'user_1')
      ).toMatchObject({ role: 'staff', authVersion: 1 });
    } finally {
      await client.close();
    }
  });

  it('persists audited membership events with actor/category, no secrets', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const ws = await seedTenant(db, 'acme-audit');
      const members = new DrizzleWorkspaceMemberStore(db);
      const audit = new DrizzleTenancyAuditSink(db);
      const member = await members.create({
        workspaceId: ws,
        userId: 'user_admin_1',
        role: 'admin',
        warehouseScope: null,
        status: 'active',
      });
      const bumped = await members.update(member.id, ws, {
        role: 'manager',
        warehouseScope: 'wh_jkt_1',
        authVersion: member.authVersion + 1,
      });
      expect(bumped.authVersion).toBe(2);
      await audit.append({
        workspaceId: ws,
        action: 'membership.role_changed',
        category: 'membership',
        actorType: 'user',
        actorId: 'user_admin_1',
        payload: {
          workspaceId: ws,
          userId: 'user_admin_1',
          to: { role: 'manager' },
          authVersion: 2,
        },
      });
      const rows = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.tenantId, ws));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: 'membership.role_changed',
        category: 'membership',
        actorId: 'user_admin_1',
      });
      expect(JSON.stringify(rows[0])).not.toMatch(/password|Bearer|@example\.com/);
    } finally {
      await client.close();
    }
  });

  it('committed 0005 SQL is additive (no drops, no secrets)', async () => {
    const committed = await readFile(
      path.join(MIGRATIONS_DIR, '0005_workspace_tenancy_audit.sql'),
      'utf8'
    );
    expect(committed).toMatch(/CREATE TABLE "workspace_members"/);
    expect(committed).toMatch(/FOREIGN KEY.*tenants/s);
    expect(committed).not.toMatch(/DROP TABLE/i);
    expect(committed).not.toMatch(/password|secret/i);
  });
});
