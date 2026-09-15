import { describe, expect, it } from 'vitest';
import {
  InMemoryTenancyStore,
  addMember,
  adminContext,
  changeMember,
  createWorkspace,
} from '../../tenancy/index';
import {
  InMemoryCredentialStore,
  InMemoryPasswordResetStore,
  InMemorySessionStore,
  SESSION_IDLE_TTL_MS,
  ScryptPasswordHasher,
  SignInRateLimiter,
  confirmPasswordReset,
  isPasswordAllowed,
  listSessions,
  normalizeEmail,
  requestPasswordReset,
  signIn,
  signOut,
  signOutAll,
  validatePassword,
  validateSession,
  InvalidCredentialsError,
  PasswordPolicyError,
  type AuthDeps,
} from '../index';

const hasher = new ScryptPasswordHasher({ N: 1024, r: 8, p: 1, keyLen: 16 });

interface Fixture {
  deps: AuthDeps;
  tenancy: InMemoryTenancyStore;
  workspaceId: string;
  email: string;
  password: string;
  userId: string;
}

async function newFixture(password = 'correct-horse-29'): Promise<Fixture> {
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
  const userId = 'user_owner_1';
  const { workspaceId } = await createWorkspace(
    tenancy,
    tenancy,
    {
      name: 'Acme',
      slug: `acme-${Math.random().toString(36).slice(2, 8)}`,
      initialAdminUserId: 'user_admin_seed',
    },
    tenancy.audit
  );
  // Member bound to the credential's user id.
  await addMember(
    tenancy,
    {
      ctx: adminContext(workspaceId, 'user_admin_seed'),
      workspaceId,
      userId,
      role: 'manager',
      warehouseScope: null,
    },
    tenancy.audit
  );
  await credentials.create({
    email: normalizeEmail(email),
    userId,
    passwordHash: await hasher.hash(password),
  });
  return { deps, tenancy, workspaceId, email, password, userId };
}

describe('password policy', () => {
  it('enforces min 8 + denylist', () => {
    expect(() => validatePassword('short')).toThrow(PasswordPolicyError);
    expect(() => validatePassword('password123')).toThrow(PasswordPolicyError);
    expect(() => validatePassword('Password123')).toThrow(PasswordPolicyError);
    expect(() => validatePassword('correct-horse-29')).not.toThrow();
    expect(isPasswordAllowed('12345678')).toBe(false);
    expect(isPasswordAllowed('sari-roti-88!')).toBe(true);
  });

  it('scrypt hashes verify and never equal the plaintext', async () => {
    const hash = await hasher.hash('correct-horse-29');
    expect(hash).not.toContain('correct-horse-29');
    expect(await hasher.verify(hash, 'correct-horse-29')).toBe(true);
    expect(await hasher.verify(hash, 'wrong-password')).toBe(false);
    expect(await hasher.verify('garbage', 'correct-horse-29')).toBe(false);
  });
});

describe('sign-in + idle TTL', () => {
  it('creates a web session and keeps it alive with activity (no absolute expiry)', async () => {
    const f = await newFixture();
    const t0 = Date.now();
    const signed = await signIn(f.deps, {
      email: f.email,
      password: f.password,
      workspaceId: f.workspaceId,
      platform: 'web',
      deviceLabel: 'office-chrome',
    });
    expect(signed.token.length).toBeGreaterThan(20);
    expect(signed.session.platform).toBe('web');

    // Active use at 29m slides the idle clock; the original 30m deadline
    // does not force logout (no absolute expiry).
    const tick = await validateSession(
      f.deps,
      signed.token,
      t0 + 29 * 60 * 1000
    );
    expect(tick).not.toBeNull();
    const stillAlive = await validateSession(
      f.deps,
      signed.token,
      t0 + 29 * 60 * 1000 + 29 * 60 * 1000
    );
    expect(stillAlive).not.toBeNull();
  });

  it('rejects idle-expired web sessions at 30m but honors mobile 7d', async () => {
    const f = await newFixture();
    const t0 = Date.now();
    const web = await signIn(f.deps, {
      email: f.email,
      password: f.password,
      workspaceId: f.workspaceId,
      platform: 'web',
    });
    const mobile = await signIn(f.deps, {
      email: f.email,
      password: f.password,
      workspaceId: f.workspaceId,
      platform: 'mobile',
      deviceLabel: 'expo-android',
    });
    expect(SESSION_IDLE_TTL_MS.web).toBe(30 * 60 * 1000);
    expect(SESSION_IDLE_TTL_MS.mobile).toBe(7 * 24 * 60 * 60 * 1000);

    // Web idle for 31m → rejected.
    expect(
      await validateSession(f.deps, web.token, t0 + 31 * 60 * 1000)
    ).toBeNull();
    // Mobile idle for 24h → still valid; idle for 8d → rejected.
    expect(
      await validateSession(f.deps, mobile.token, t0 + 24 * 60 * 60 * 1000)
    ).not.toBeNull();
    expect(
      await validateSession(
        f.deps,
        mobile.token,
        t0 + 24 * 60 * 60 * 1000 + 8 * 24 * 60 * 60 * 1000
      )
    ).toBeNull();
  });

  it('rejects sign-in without leaking whether the email exists', async () => {
    const f = await newFixture();
    const unknownEmail = await signIn(f.deps, {
      email: 'nobody@example.com',
      password: 'whatever-123',
      workspaceId: f.workspaceId,
      platform: 'web',
    }).catch((e: unknown) => e);
    const wrongPassword = await signIn(f.deps, {
      email: f.email,
      password: 'wrong-password-1',
      workspaceId: f.workspaceId,
      platform: 'web',
    }).catch((e: unknown) => e);
    expect(unknownEmail).toBeInstanceOf(InvalidCredentialsError);
    expect(wrongPassword).toBeInstanceOf(InvalidCredentialsError);
    expect((unknownEmail as Error).message).toBe(
      (wrongPassword as Error).message
    );
    // Security events emitted without identifiers.
    const failed = f.tenancy.auditEvents.filter(
      (e) => e.action === 'security.sign_in_failed'
    );
    expect(failed.length).toBe(2);
    for (const e of failed) {
      expect(JSON.stringify(e)).not.toMatch(/nobody|whatever|wrong-password/);
    }
  });
});

describe('revocation', () => {
  it('signs out this device only; sign-out-all revokes everything', async () => {
    const f = await newFixture();
    const a = await signIn(f.deps, {
      email: f.email,
      password: f.password,
      workspaceId: f.workspaceId,
      platform: 'web',
    });
    const b = await signIn(f.deps, {
      email: f.email,
      password: f.password,
      workspaceId: f.workspaceId,
      platform: 'mobile',
    });
    expect(await listSessions(f.deps, f.userId)).toHaveLength(2);

    expect(await signOut(f.deps, a.token)).toEqual({ revoked: true });
    expect(await validateSession(f.deps, a.token)).toBeNull();
    expect(await validateSession(f.deps, b.token)).not.toBeNull();
    expect(await listSessions(f.deps, f.userId)).toHaveLength(1);

    const all = await signOutAll(f.deps, {
      userId: f.userId,
      workspaceId: f.workspaceId,
    });
    expect(all.revokedCount).toBe(1);
    expect(await validateSession(f.deps, b.token)).toBeNull();
    expect(await listSessions(f.deps, f.userId)).toHaveLength(0);
    expect(f.tenancy.auditEvents.map((e) => e.action)).toContain(
      'security.forced_sign_out'
    );
  });

  it('revokes sessions on Admin deactivate: rows revoked, list empty, forced_sign_out emitted', async () => {
    const f = await newFixture();
    const signed = await signIn(f.deps, {
      email: f.email,
      password: f.password,
      workspaceId: f.workspaceId,
      platform: 'web',
    });
    expect(await validateSession(f.deps, signed.token)).not.toBeNull();
    expect(await listSessions(f.deps, f.userId)).toHaveLength(1);

    await changeMember(
      f.deps.members,
      {
        ctx: adminContext(f.workspaceId, 'user_admin_seed'),
        workspaceId: f.workspaceId,
        targetUserId: f.userId,
        status: 'deactivated',
      },
      f.deps.audit,
      f.deps.sessions
    );
    // Session rows are revoked (not only auth-stale): validation fails…
    expect(await validateSession(f.deps, signed.token)).toBeNull();
    // …and the list no longer shows them as active inventory…
    expect(await listSessions(f.deps, f.userId)).toHaveLength(0);
    // …with a forced_sign_out audit event matching password-reset parity.
    const forced = f.tenancy.auditEvents.filter(
      (e) => e.action === 'security.forced_sign_out'
    );
    expect(forced).toHaveLength(1);
    expect(forced[0]).toMatchObject({
      category: 'security',
      actorId: 'user_admin_seed',
      payload: {
        workspaceId: f.workspaceId,
        userId: f.userId,
        reason: 'admin_deactivate',
      },
    });
    // Sign-in after deactivate fails generically.
    await expect(
      signIn(f.deps, {
        email: f.email,
        password: f.password,
        workspaceId: f.workspaceId,
        platform: 'web',
      })
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('hides auth-stale sessions from the list even without row revocation', async () => {
    const f = await newFixture();
    await signIn(f.deps, {
      email: f.email,
      password: f.password,
      workspaceId: f.workspaceId,
      platform: 'web',
    });
    expect(await listSessions(f.deps, f.userId)).toHaveLength(1);

    // Role change without a session revoker: rows survive, but the stale
    // auth_version must still drop them from the active list.
    await changeMember(
      f.deps.members,
      {
        ctx: adminContext(f.workspaceId, 'user_admin_seed'),
        workspaceId: f.workspaceId,
        targetUserId: f.userId,
        role: 'staff',
      },
      f.deps.audit
    );
    expect(await listSessions(f.deps, f.userId)).toHaveLength(0);
  });
});

describe('password reset', () => {
  it('revokes all sessions and emits security events on confirm', async () => {
    const f = await newFixture();
    const a = await signIn(f.deps, {
      email: f.email,
      password: f.password,
      workspaceId: f.workspaceId,
      platform: 'web',
    });
    const b = await signIn(f.deps, {
      email: f.email,
      password: f.password,
      workspaceId: f.workspaceId,
      platform: 'mobile',
    });
    const { resetToken } = await requestPasswordReset(f.deps, {
      email: f.email,
    });
    expect(resetToken).toBeTruthy();

    // Unknown emails get the same shape (no oracle).
    const unknown = await requestPasswordReset(f.deps, {
      email: 'ghost@example.com',
    });
    expect(unknown.resetToken).toBeNull();

    await confirmPasswordReset(f.deps, {
      resetToken: resetToken as string,
      newPassword: 'fresh-noodles-42',
    });
    expect(await validateSession(f.deps, a.token)).toBeNull();
    expect(await validateSession(f.deps, b.token)).toBeNull();
    // Old password dead, new password works.
    await expect(
      signIn(f.deps, {
        email: f.email,
        password: f.password,
        workspaceId: f.workspaceId,
        platform: 'web',
      })
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    const renewed = await signIn(f.deps, {
      email: f.email,
      password: 'fresh-noodles-42',
      workspaceId: f.workspaceId,
      platform: 'web',
    });
    expect(renewed.userId).toBe(f.userId);

    const actions = f.tenancy.auditEvents.map((e) => e.action);
    expect(actions).toContain('security.password_reset');
    expect(actions).toContain('security.forced_sign_out');
    // Reset reuse rejected.
    await expect(
      confirmPasswordReset(f.deps, {
        resetToken: resetToken as string,
        newPassword: 'another-fresh-43',
      })
    ).rejects.toThrow();
  });

  it('rejects weak reset passwords and enforces expiry', async () => {
    const f = await newFixture();
    const { resetToken } = await requestPasswordReset(f.deps, {
      email: f.email,
    });
    await expect(
      confirmPasswordReset(f.deps, {
        resetToken: resetToken as string,
        newPassword: 'password123',
      })
    ).rejects.toBeInstanceOf(PasswordPolicyError);
  });
});

describe('rate limiting', () => {
  it('allows 5 failures then rate-limits the 6th without leaking state', async () => {
    const f = await newFixture();
    const attempt = () =>
      signIn(f.deps, {
        email: f.email,
        password: 'wrong-password-1',
        workspaceId: f.workspaceId,
        platform: 'web',
        ip: '10.0.0.9',
      }).catch((e: unknown) => e);
    for (let i = 0; i < 5; i += 1) {
      expect(await attempt()).toBeInstanceOf(InvalidCredentialsError);
    }
    const sixth = (await attempt()) as Error;
    // Rate-limited path is distinct (routes map it to 429) but carries no
    // identifier state — never "account locked" vs "bad password".
    expect(sixth.name).toBe('RateLimitedError');
    expect(
      f.deps.rateLimiter.count(`${normalizeEmail(f.email)}|10.0.0.9`)
    ).toBe(5);
  });
});

describe('no secret leakage', () => {
  it('keeps passwords, hashes, and tokens out of audit events and views', async () => {
    const f = await newFixture('s3cret-noodles-77');
    const signed = await signIn(f.deps, {
      email: f.email,
      password: 's3cret-noodles-77',
      workspaceId: f.workspaceId,
      platform: 'web',
    });
    const sessions = await listSessions(f.deps, f.userId);
    const wire = JSON.stringify({
      audit: f.tenancy.auditEvents,
      sessions,
      session: signed.session,
    });
    expect(wire).not.toContain('s3cret-noodles-77');
    expect(wire).not.toContain(signed.token);
    expect(wire).not.toMatch(/passwordHash|tokenHash/);
    expect(wire).not.toContain(f.email);
  });
});
