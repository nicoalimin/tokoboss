import { describe, expect, it } from 'vitest';
import { InMemoryTenancyStore } from '../../tenancy/in-memory-tenancy-store';
import { deactivateAccount } from '../account-deactivation';
import { AuthError } from '../auth-errors';
import { hashToken, mintToken } from '../crypto';
import {
  InMemoryCredentialStore,
  InMemorySessionStore,
} from '../in-memory-auth-store';

const USER = 'user_owner';

async function newFixture() {
  const tenancy = new InMemoryTenancyStore();
  const credentials = new InMemoryCredentialStore();
  const sessions = new InMemorySessionStore();
  await credentials.create({
    email: 'owner@example.com',
    userId: USER,
    passwordHash: 'hash',
  });
  const deps = { credentials, sessions, audit: tenancy.audit };
  return { deps, credentials, sessions, tenancy };
}

async function mintSession(
  sessions: InMemorySessionStore,
  workspaceId: string | null
): Promise<string> {
  const token = mintToken();
  await sessions.create({
    userId: USER,
    workspaceId,
    platform: workspaceId ? 'mobile' : 'web',
    deviceLabel: 'r22',
    tokenHash: hashToken(token),
    authVersion: 1,
    lastSeenAt: new Date(),
  });
  return token;
}

describe('deactivateAccount (US29 / RFC 02 rows 21–22)', () => {
  it('sets deactivated_at, bumps authVersion, revokes both session shapes, audits', async () => {
    const f = await newFixture();
    const webToken = await mintSession(f.sessions, null);
    const mobileToken = await mintSession(f.sessions, 'ws_acme');
    const at = new Date('2026-10-13T00:00:00Z');

    const res = await deactivateAccount(
      f.deps,
      { userId: USER, actorId: 'user_admin', correlationId: 'corr_r22' },
      at
    );

    expect(res).toEqual({
      revokedCount: 2,
      authVersion: 2,
      alreadyDeactivated: false,
    });
    const state = await f.credentials.getAccountState(USER);
    expect(state?.deactivatedAt?.toISOString()).toBe(at.toISOString());
    expect(state?.authVersion).toBe(2);
    for (const token of [webToken, mobileToken]) {
      const row = await f.sessions.findByTokenHash(hashToken(token));
      expect(row?.revokedAt).not.toBeNull();
    }
    expect(f.tenancy.auditEvents.at(-1)).toMatchObject({
      workspaceId: null,
      action: 'security.account_deactivated',
      category: 'security',
      actorId: 'user_admin',
      correlationId: 'corr_r22',
      payload: {
        userId: USER,
        authVersion: 2,
        revokedCount: 2,
        reason: 'account_deactivate',
      },
    });
  });

  it('re-run keeps the original timestamp, still bumps + revokes, reason repeat', async () => {
    const f = await newFixture();
    const first = new Date('2026-10-13T00:00:00Z');
    await deactivateAccount(f.deps, { userId: USER }, first);
    const raced = await mintSession(f.sessions, null);

    const res = await deactivateAccount(
      f.deps,
      { userId: USER },
      new Date('2026-10-14T00:00:00Z')
    );

    expect(res).toEqual({
      revokedCount: 1,
      authVersion: 3,
      alreadyDeactivated: true,
    });
    const state = await f.credentials.getAccountState(USER);
    expect(state?.deactivatedAt?.toISOString()).toBe(first.toISOString());
    const row = await f.sessions.findByTokenHash(hashToken(raced));
    expect(row?.revokedAt).not.toBeNull();
    expect(f.tenancy.auditEvents.at(-1)).toMatchObject({
      action: 'security.account_deactivated',
      actorId: USER,
      payload: { reason: 'repeat', authVersion: 3, revokedCount: 1 },
    });
  });

  it('unknown account throws ACCOUNT_NOT_FOUND; bad userId rejected; no audit', async () => {
    const f = await newFixture();
    const err = await deactivateAccount(f.deps, { userId: 'user_ghost' }).catch(
      (e: unknown) => e
    );
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).code).toBe('ACCOUNT_NOT_FOUND');
    await expect(
      deactivateAccount(f.deps, { userId: 'owner@example.com' })
    ).rejects.toThrow();
    await expect(deactivateAccount(f.deps, { userId: '' })).rejects.toThrow();
    expect(f.tenancy.auditEvents).toHaveLength(0);
  });
});
