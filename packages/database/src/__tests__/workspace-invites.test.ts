import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { count, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

/**
 * Workspace invites migration + store integration (UTA-70).
 *
 * Applies the committed chain 0001 → 0007 to an empty PGlite database (no
 * Neon credentials) and proves:
 * 1. `0007_workspace_invites.sql` applies cleanly on top of main's
 *    migrations (workspace_invites + indexes, additive only).
 * 2. `token_hash` uniqueness rejects duplicate tickets.
 * 3. The pending-email lookup is workspace-scoped and hides expired rows.
 * 4. The audit sink persists `invite.*` rows with the `invite` category
 *    and opaque-ids-only payloads (no email, no token).
 */
import { auditEvents, schema, tenants } from '../schema/index';
import { DrizzleInviteStore } from '../repositories/drizzle-invite-repository';
import { DrizzleTenancyAuditSink } from '../repositories/drizzle-workspace-member-repository';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../infra/drizzle');
const CHAIN = [
  '0001_initial.sql',
  '0002_initial_schema.sql',
  '0003_jobs_job_events.sql',
  '0004_file_uploads.sql',
  '0005_workspace_tenancy_audit.sql',
  '0006_auth_sessions.sql',
  '0007_workspace_invites.sql',
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

describe('workspace invites migration + drizzle store', () => {
  it('applies 0007 on top of main and starts empty', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const ws = await seedTenant(db, 'acme-invites');
      const store = new DrizzleInviteStore(db);
      expect(await store.listByWorkspace(ws)).toHaveLength(0);
      const events = await db.select({ n: count() }).from(auditEvents);
      expect(events[0]?.n).toBe(0);
    } finally {
      await client.close();
    }
  });

  it('enforces token_hash uniqueness', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const ws = await seedTenant(db, 'acme-invite-unique');
      const store = new DrizzleInviteStore(db);
      const input = {
        workspaceId: ws,
        email: 'hire@example.com',
        role: 'staff' as const,
        warehouseScope: null,
        tokenHash: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedBy: 'user_admin_1',
      };
      await store.create(input);
      await expect(
        store.create({ ...input, email: 'other@example.com' })
      ).rejects.toThrow(/INVITE_CONFLICT/);
    } finally {
      await client.close();
    }
  });

  it('scopes pending-email lookup by workspace and hides expired rows', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const wsA = await seedTenant(db, 'acme-inv-a');
      const wsB = await seedTenant(db, 'acme-inv-b');
      const store = new DrizzleInviteStore(db);
      const now = new Date();
      await store.create({
        workspaceId: wsA,
        email: 'hire@example.com',
        role: 'staff',
        warehouseScope: null,
        tokenHash: 'b'.repeat(64),
        expiresAt: new Date(now.getTime() + 86_400_000),
        invitedBy: 'user_admin_1',
      });
      // Same email, other workspace → null (use-cases map this to deny).
      expect(
        await store.findPendingByWorkspaceAndEmail(wsB, 'hire@example.com', now)
      ).toBeNull();
      expect(
        await store.findPendingByWorkspaceAndEmail(wsA, 'hire@example.com', now)
      ).toMatchObject({ role: 'staff', status: 'pending' });

      // Expired tickets are invisible to the duplicate check (re-invite OK).
      await store.create({
        workspaceId: wsA,
        email: 'stale@example.com',
        role: 'staff',
        warehouseScope: null,
        tokenHash: 'c'.repeat(64),
        expiresAt: new Date(now.getTime() - 1_000),
        invitedBy: 'user_admin_1',
      });
      expect(
        await store.findPendingByWorkspaceAndEmail(
          wsA,
          'stale@example.com',
          now
        )
      ).toBeNull();
    } finally {
      await client.close();
    }
  });

  it('persists invite lifecycle (accept) and invite-category audit rows', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const ws = await seedTenant(db, 'acme-inv-audit');
      const invites = new DrizzleInviteStore(db);
      const audit = new DrizzleTenancyAuditSink(db);
      const created = await invites.create({
        workspaceId: ws,
        email: 'hire@example.com',
        role: 'manager',
        warehouseScope: 'wh_jkt_1',
        tokenHash: 'd'.repeat(64),
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedBy: 'user_admin_1',
      });
      const accepted = await invites.update(created.id, ws, {
        status: 'accepted',
        acceptedAt: new Date(),
      });
      expect(accepted.status).toBe('accepted');
      await audit.append({
        workspaceId: ws,
        action: 'invite.accepted',
        category: 'invite',
        actorType: 'user',
        actorId: 'user_hire_1',
        payload: {
          workspaceId: ws,
          inviteId: created.id,
          userId: 'user_hire_1',
          role: 'manager',
        },
      });
      const rows = await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.tenantId, ws));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: 'invite.accepted',
        category: 'invite',
        actorId: 'user_hire_1',
      });
      expect(JSON.stringify(rows[0])).not.toMatch(
        /hire@example\.com|password|Bearer/
      );
    } finally {
      await client.close();
    }
  });

  it('committed 0007 SQL is additive (no drops, no secrets)', async () => {
    const committed = await readFile(
      path.join(MIGRATIONS_DIR, '0007_workspace_invites.sql'),
      'utf8'
    );
    expect(committed).toMatch(/CREATE TABLE "workspace_invites"/);
    expect(committed).toMatch(/FOREIGN KEY.*tenants/s);
    expect(committed).not.toMatch(/DROP TABLE/i);
    expect(committed).not.toMatch(/password|secret/i);
  });
});
