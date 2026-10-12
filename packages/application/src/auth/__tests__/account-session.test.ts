import { describe, expect, it } from 'vitest';
import { InMemoryTenancyStore } from '../../tenancy/in-memory-tenancy-store';
import { InvalidCredentialsError } from '../auth-errors';
import { hashToken, mintToken, ScryptPasswordHasher } from '../crypto';
import {
  InMemoryCredentialStore,
  InMemoryPasswordResetStore,
  InMemorySessionStore,
} from '../in-memory-auth-store';
import { SignInRateLimiter } from '../rate-limit';
import {
  confirmPasswordReset,
  requestPasswordReset,
  signIn,
  signOutAll,
  validateSession,
  type AuthDeps,
} from '../auth-use-cases';
import { normalizeEmail } from '../password-policy';

const hasher = new ScryptPasswordHasher({ N: 1024, r: 8, p: 1, keyLen: 16 });
const PASSWORD = 'correct-horse-29';

interface Fixture {
  deps: AuthDeps;
  credentials: InMemoryCredentialStore;
  sessions: InMemorySessionStore;
  tenancy: InMemoryTenancyStore;
  workspaceId: string;
  userId: string;
  email: string;
}

async function newFixture(): Promise<Fixture> {
  const tenancy = new InMemoryTenancyStore();
  const credentials = new InMemoryCredentialStore();
  const sessions = new InMemorySessionStore();
  const resets = new InMemoryPasswordResetStore();
  const deps: AuthDeps = {
    credentials,
    sessions,
    resets,
    members: tenancy,
    hasher,
    audit: tenancy.audit,
    rateLimiter: new SignInRateLimiter(),
  };
  const email = 'owner@example.com';
  const userId = 'user_owner';
  const ws = await tenancy.createWorkspace({ name: 'Acme', slug: 'acme-r20' });
  await tenancy.create({
    workspaceId: ws.id,
    userId,
    role: 'admin',
    warehouseScope: null,
    status: 'active',
  });
  await credentials.create({
    email: normalizeEmail(email),
    userId,
    passwordHash: await hasher.hash(PASSWORD),
  });
  return {
    deps,
    credentials,
    sessions,
    tenancy,
    workspaceId: ws.id,
    userId,
    email,
  };
}

async function mintAccountSession(
  f: Fixture,
  authVersion: number
): Promise<string> {
  const token = mintToken();
  await f.sessions.create({
    userId: f.userId,
    workspaceId: null,
    platform: 'web',
    deviceLabel: 'acct',
    tokenHash: hashToken(token),
    authVersion,
    lastSeenAt: new Date(),
  });
  return token;
}

describe('account-session (US29 / RFC 02 rows 18–19)', () => {
  it('validateSession NULL-workspace: match ok; user-version bump + deactivated revoke', async () => {
    const f = await newFixture();
    const token = await mintAccountSession(f, 1);

    const ok = await validateSession(f.deps, token);
    expect(ok).toMatchObject({
      userId: f.userId,
      workspaceId: null,
      authVersion: 1,
    });

    await f.credentials.bumpAuthVersion(f.userId);
    expect(await validateSession(f.deps, token)).toBeNull();
    const stale = await f.sessions.findByTokenHash(hashToken(token));
    expect(stale?.revokedAt).not.toBeNull();

    const token2 = await mintAccountSession(f, 2);
    expect(await validateSession(f.deps, token2)).toMatchObject({
      workspaceId: null,
      authVersion: 2,
    });
    await f.credentials.setDeactivatedAt(f.userId, new Date());
    expect(await validateSession(f.deps, token2)).toBeNull();
  });

  it('signOutAll bumps user authVersion so account sessions go auth-stale', async () => {
    const f = await newFixture();
    const token = await mintAccountSession(f, 1);
    expect(await validateSession(f.deps, token)).not.toBeNull();

    const res = await signOutAll(f.deps, {
      userId: f.userId,
      workspaceId: f.workspaceId,
    });
    expect(res.revokedCount).toBeGreaterThanOrEqual(1);
    const state = await f.credentials.getAccountState(f.userId);
    expect(state?.authVersion).toBe(2);
    expect(await validateSession(f.deps, token)).toBeNull();
  });

  it('legacy signIn rejects deactivated; confirmPasswordReset bumps user authVersion', async () => {
    const f = await newFixture();
    await f.credentials.setDeactivatedAt(f.userId, new Date());
    await expect(
      signIn(f.deps, {
        email: f.email,
        password: PASSWORD,
        workspaceId: f.workspaceId,
        platform: 'web',
      })
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(await f.sessions.listByUser(f.userId)).toHaveLength(0);

    await f.credentials.setDeactivatedAt(f.userId, null);
    const before = await f.credentials.getAccountState(f.userId);
    expect(before?.authVersion).toBe(1);
    const { resetToken } = await requestPasswordReset(f.deps, {
      email: f.email,
    });
    expect(resetToken).toBeTruthy();
    await confirmPasswordReset(f.deps, {
      resetToken: resetToken!,
      newPassword: 'sari-roti-88!',
    });
    const after = await f.credentials.getAccountState(f.userId);
    expect(after?.authVersion).toBe(2);
  });
});
