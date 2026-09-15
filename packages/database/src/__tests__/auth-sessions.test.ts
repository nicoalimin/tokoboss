import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';

/**
 * Password-auth migration + store integration (UTA-67).
 *
 * Applies the committed chain 0001 → 0006 to an empty PGlite database and
 * proves:
 * 1. `0006_auth_sessions.sql` applies cleanly (auth_users, auth_sessions,
 *    auth_password_resets — additive only).
 * 2. Email/user uniqueness rejects duplicate credentials.
 * 3. Token-hash uniqueness rejects duplicate session rows.
 * 4. Revoke-one / revoke-all semantics work at the store boundary.
 * 5. Committed SQL stores hashes only (no plaintext password column).
 */
import { authSessions, authUsers, schema, tenants } from '../schema/index';
import {
  DrizzleCredentialStore,
  DrizzlePasswordResetStore,
  DrizzleSessionStore,
} from '../repositories/drizzle-auth-repository';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../infra/drizzle');
const CHAIN = [
  '0001_initial.sql',
  '0002_initial_schema.sql',
  '0003_jobs_job_events.sql',
  '0004_file_uploads.sql',
  '0005_workspace_tenancy_audit.sql',
  '0006_auth_sessions.sql',
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

describe('auth sessions migration + drizzle stores', () => {
  it('applies 0006 on top of main and starts empty', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const ws = await seedTenant(db, 'acme-auth');
      const sessions = new DrizzleSessionStore(db);
      expect(await sessions.listByUser('user_1')).toHaveLength(0);
      expect(ws.length).toBeGreaterThan(0);
    } finally {
      await client.close();
    }
  });

  it('enforces email/user uniqueness on credentials', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const creds = new DrizzleCredentialStore(db);
      await creds.create({
        email: 'owner@example.com',
        userId: 'user_1',
        passwordHash: 'scrypt$v1$stub',
      });
      await expect(
        creds.create({
          email: 'owner@example.com',
          userId: 'user_2',
          passwordHash: 'scrypt$v1$stub',
        })
      ).rejects.toThrow(/CREDENTIAL_CONFLICT/);
      const found = await creds.findByEmail('owner@example.com');
      expect(found).toMatchObject({ userId: 'user_1' });
      await creds.updatePasswordHash('user_1', 'scrypt$v1$rotated');
      expect((await creds.findByUserId('user_1'))?.passwordHash).toBe(
        'scrypt$v1$rotated'
      );
    } finally {
      await client.close();
    }
  });

  it('stores sessions by token hash with revoke one/all', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const ws = await seedTenant(db, 'acme-sessions');
      const sessions = new DrizzleSessionStore(db);
      const now = new Date();
      const a = await sessions.create({
        userId: 'user_1',
        workspaceId: ws,
        platform: 'web',
        deviceLabel: 'chrome',
        tokenHash: 'hash_a',
        authVersion: 1,
        lastSeenAt: now,
      });
      await sessions.create({
        userId: 'user_1',
        workspaceId: ws,
        platform: 'mobile',
        deviceLabel: null,
        tokenHash: 'hash_b',
        authVersion: 1,
        lastSeenAt: now,
      });
      // Duplicate token hash rejected.
      await expect(
        sessions.create({
          userId: 'user_1',
          workspaceId: ws,
          platform: 'web',
          deviceLabel: null,
          tokenHash: 'hash_a',
          authVersion: 1,
          lastSeenAt: now,
        })
      ).rejects.toThrow(/SESSION_CONFLICT/);

      expect(await sessions.revokeByTokenHash('hash_a', new Date())).toBe(true);
      expect(await sessions.findByTokenHash('hash_a')).toMatchObject({
        id: a.id,
      });
      const revoked = await sessions.findByTokenHash('hash_a');
      expect(revoked?.revokedAt).not.toBeNull();
      // Second revoke is a no-op (already revoked).
      expect(await sessions.revokeByTokenHash('hash_a', new Date())).toBe(
        false
      );

      const touchedAt = new Date(now.getTime() + 60_000);
      await sessions.touch(
        (await sessions.findByTokenHash('hash_b'))!.id,
        touchedAt
      );
      expect(
        (await sessions.findByTokenHash('hash_b'))?.lastSeenAt.getTime()
      ).toBe(touchedAt.getTime());

      expect(await sessions.revokeAllByUser('user_1', new Date())).toBe(1);
      expect(await sessions.listByUser('user_1')).toHaveLength(2);
    } finally {
      await client.close();
    }
  });

  it('persists single-use reset tickets', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const resets = new DrizzlePasswordResetStore(db);
      const ticket = await resets.create({
        userId: 'user_1',
        tokenHash: 'reset_hash_1',
        expiresAt: new Date(Date.now() + 3600_000),
      });
      expect(ticket.usedAt).toBeNull();
      await resets.markUsed(ticket.id, new Date());
      expect(
        (await resets.findByTokenHash('reset_hash_1'))?.usedAt
      ).not.toBeNull();
    } finally {
      await client.close();
    }
  });

  it('committed 0006 SQL is additive with hashes only (no plaintext)', async () => {
    const committed = await readFile(
      path.join(MIGRATIONS_DIR, '0006_auth_sessions.sql'),
      'utf8'
    );
    expect(committed).toMatch(/CREATE TABLE "auth_users"/);
    expect(committed).toMatch(/CREATE TABLE "auth_sessions"/);
    expect(committed).toMatch(/CREATE TABLE "auth_password_resets"/);
    expect(committed).toMatch(/token_hash/);
    expect(committed).toMatch(/last_seen_at/);
    expect(committed).not.toMatch(/DROP TABLE/i);
    expect(committed).not.toMatch(/password[^_]|plaintext/i);
    // Stored rows carry hashes, never plaintext.
    const { client, db } = await createMigratedDb();
    try {
      const rows = await db.select().from(authUsers);
      expect(rows).toHaveLength(0);
      const sess = await db.select().from(authSessions);
      expect(sess).toHaveLength(0);
    } finally {
      await client.close();
    }
  });
});
