import { describe, expect, it } from 'vitest';
import { InMemoryTenancyStore } from '../../tenancy/in-memory-tenancy-store';
import { signInAccount, type AccountSignInDeps } from '../account-sign-in';
import { InvalidCredentialsError, RateLimitedError } from '../auth-errors';
import { hashToken, ScryptPasswordHasher } from '../crypto';
import {
  InMemoryCredentialStore,
  InMemorySessionStore,
} from '../in-memory-auth-store';
import { SignInRateLimiter } from '../rate-limit';

const hasher = new ScryptPasswordHasher({ N: 1024, r: 8, p: 1, keyLen: 16 });
const PASSWORD = 'correct-horse-29';

interface Fixture {
  deps: AccountSignInDeps;
  tenancy: InMemoryTenancyStore;
  credentials: InMemoryCredentialStore;
  sessions: InMemorySessionStore;
  limiter: SignInRateLimiter;
}

async function newFixture(maxFailures = 5): Promise<Fixture> {
  const tenancy = new InMemoryTenancyStore();
  const credentials = new InMemoryCredentialStore();
  const sessions = new InMemorySessionStore();
  const limiter = new SignInRateLimiter({ maxFailures });
  await credentials.create({
    email: 'owner@example.com',
    userId: 'user_owner',
    passwordHash: await hasher.hash(PASSWORD),
  });
  const deps: AccountSignInDeps = {
    credentials,
    sessions,
    members: tenancy,
    hasher,
    audit: tenancy.audit,
    rateLimiter: limiter,
  };
  return { deps, tenancy, credentials, sessions, limiter };
}

function actions(t: InMemoryTenancyStore): string[] {
  return t.auditEvents.map((e) => e.action);
}

describe('signInAccount (US29 / RFC 02 rows 16–17)', () => {
  it('success: NULL-workspace session with account authVersion, landing, audit', async () => {
    const f = await newFixture();
    await f.credentials.bumpAuthVersion('user_owner');
    const ws = await f.tenancy.createWorkspace({
      name: 'Satu Toko',
      slug: 'satu-toko',
    });
    await f.tenancy.create({
      workspaceId: ws.id,
      userId: 'user_owner',
      role: 'admin',
      warehouseScope: null,
      status: 'active',
    });

    const res = await signInAccount(f.deps, {
      email: '  Owner@Example.com ',
      password: PASSWORD,
      platform: 'desktop-app',
      deviceLabel: `  ${'x'.repeat(130)}  `,
      ip: '10.0.0.1',
      correlationId: 'corr_ok',
    });

    expect(res.userId).toBe('user_owner');
    expect(res.landing).toEqual({ kind: 'workspace', workspaceId: ws.id });
    expect(res.session.platform).toBe('web');
    expect(res.session.authVersion).toBe(2);
    expect(res.session.deviceLabel).toBe('x'.repeat(120));
    const stored = await f.sessions.findByTokenHash(hashToken(res.token));
    expect(stored?.workspaceId).toBeNull();
    expect(stored?.userId).toBe('user_owner');

    const ok = f.tenancy.auditEvents.at(-1);
    expect(ok).toMatchObject({
      workspaceId: null,
      action: 'security.sign_in_succeeded',
      category: 'security',
      actorId: 'user_owner',
      correlationId: 'corr_ok',
      payload: { userId: 'user_owner', authVersion: 2 },
    });

    // No memberships → picker; blank label → null.
    const g = await newFixture();
    const res2 = await signInAccount(g.deps, {
      email: 'owner@example.com',
      password: PASSWORD,
      platform: 'mobile',
      deviceLabel: '   ',
    });
    expect(res2.landing).toEqual({ kind: 'picker' });
    expect(res2.session.platform).toBe('mobile');
    expect(res2.session.deviceLabel).toBeNull();
    expect(res2.session.authVersion).toBe(1);
  });

  it('unknown email, wrong password, empty email, deactivated → generic InvalidCredentialsError', async () => {
    const f = await newFixture();
    const base = { platform: 'web' as const, ip: '10.0.0.2' };

    await expect(
      signInAccount(f.deps, {
        ...base,
        email: 'nobody@example.com',
        password: PASSWORD,
      })
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(
      signInAccount(f.deps, {
        ...base,
        email: 'owner@example.com',
        password: 'wrong-pass-1',
      })
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(
      signInAccount(f.deps, { ...base, email: '   ', password: PASSWORD })
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    await f.credentials.setDeactivatedAt('user_owner', new Date());
    await expect(
      signInAccount(f.deps, {
        ...base,
        email: 'owner@example.com',
        password: PASSWORD,
      })
    ).rejects.toBeInstanceOf(InvalidCredentialsError);

    expect(actions(f.tenancy)).toEqual([
      'security.sign_in_failed',
      'security.sign_in_failed',
      'security.sign_in_failed',
      'security.sign_in_failed',
    ]);
    for (const e of f.tenancy.auditEvents) {
      expect(e.workspaceId).toBeNull();
      expect(e.payload).toEqual({ reason: 'invalid' });
    }
    expect(await f.sessions.listByUser('user_owner')).toHaveLength(0);
  });

  it('rate limit: exhausted key throws RateLimitedError after failed audit; success resets', async () => {
    const f = await newFixture(2);
    const input = {
      email: 'owner@example.com',
      platform: 'web' as const,
      ip: '10.0.0.3',
    };
    const key = 'owner@example.com|10.0.0.3';

    await expect(
      signInAccount(f.deps, { ...input, password: 'wrong-pass-1' })
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    // Success before the limit resets the failure counter.
    await signInAccount(f.deps, { ...input, password: PASSWORD });
    expect(f.limiter.count(key)).toBe(0);

    for (let i = 0; i < 2; i += 1) {
      await expect(
        signInAccount(f.deps, { ...input, password: 'wrong-pass-1' })
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    }
    const before = f.tenancy.auditEvents.length;
    await expect(
      signInAccount(f.deps, { ...input, password: PASSWORD })
    ).rejects.toBeInstanceOf(RateLimitedError);
    expect(f.tenancy.auditEvents).toHaveLength(before + 1);
    expect(f.tenancy.auditEvents.at(-1)?.action).toBe(
      'security.sign_in_failed'
    );
    expect(await f.sessions.listByUser('user_owner')).toHaveLength(1);
  });
});
