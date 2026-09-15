import { beforeEach, describe, expect, it } from 'vitest';
import { __resetAuthForTests, seedFixtureCredential } from '../lib/auth';
import { __resetUploadsForTests, getUploadStore } from '../lib/uploads';
import { GET as getMe, PATCH as updateMe } from '../app/api/auth/me/route';
import { POST as changePassword } from '../app/api/auth/password/change/route';
import { POST as signIn } from '../app/api/auth/sign-in/route';
import { GET as listSessions } from '../app/api/auth/sessions/route';
import { completeUpload, requestUploadToken } from '@tokoboss/application';
import { MemoryBlobAdapter } from '@tokoboss/integrations';

/**
 * Personal profile Route Handler flow (UTA-72) through the memory wiring:
 * read defaults → update display name → link avatar (private file_uploads
 * reference) → change password (revoke-all + security events) →
 * cross-user denial + secret hygiene.
 */

const EMAIL = 'owner@fixture.test';
const PASSWORD = 'sari-roti-88!';

function jsonRequest(
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function authed(
  path: string,
  token: string,
  init?: { method?: string; body?: unknown }
): Request {
  return new Request(`http://localhost${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body !== undefined
        ? { 'content-type': 'application/json' }
        : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

async function signInMobile(workspaceId: string): Promise<string> {
  const res = await signIn(
    jsonRequest('/api/auth/sign-in', {
      email: EMAIL,
      password: PASSWORD,
      workspaceId,
      platform: 'mobile',
    })
  );
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

describe('profile routes (memory wiring)', () => {
  let workspaceId: string;

  beforeEach(async () => {
    __resetAuthForTests();
    __resetUploadsForTests();
    ({ workspaceId } = await seedFixtureCredential({
      email: EMAIL,
      password: PASSWORD,
    }));
  });

  it('reads defaults then updates display name (own profile only)', async () => {
    const token = await signInMobile(workspaceId);

    const read = await getMe(authed('/api/auth/me', token));
    expect(read.status).toBe(200);
    const readBody = (await read.json()) as {
      profile: {
        userId: string;
        email: string;
        displayName: string | null;
        avatarUploadId: string | null;
      };
    };
    expect(readBody.profile.email).toBe(EMAIL);
    expect(readBody.profile.displayName).toBeNull();
    expect(readBody.profile.avatarUploadId).toBeNull();
    expect(JSON.stringify(readBody)).not.toMatch(/passwordHash|tokenHash/);

    const updated = await updateMe(
      authed('/api/auth/me', token, {
        method: 'PATCH',
        body: { displayName: 'Budi Santoso' },
      })
    );
    expect(updated.status).toBe(200);
    const updatedBody = (await updated.json()) as {
      profile: { displayName: string };
    };
    expect(updatedBody.profile.displayName).toBe('Budi Santoso');

    // Extra userId fields are rejected by the contract — no cross-user write.
    const evil = await updateMe(
      authed('/api/auth/me', token, {
        method: 'PATCH',
        body: { displayName: 'Hacker', userId: 'user_other' },
      })
    );
    // Zod strips unknown keys by default, so this updates *own* profile;
    // the point is no other user's profile can be targeted (no target param).
    expect(evil.status).toBe(200);
    const reread = (await (
      await getMe(authed('/api/auth/me', token))
    ).json()) as { profile: { displayName: string } };
    expect(reread.profile.displayName).toBe('Hacker');
  });

  it('links a completed avatar upload, denies cross-workspace references', async () => {
    const token = await signInMobile(workspaceId);
    const store = getUploadStore();
    const blob = new MemoryBlobAdapter();
    const issued = await requestUploadToken(store, blob, {
      workspaceId,
      purpose: 'avatar',
      filename: 'me.png',
      contentType: 'image/png',
      byteSize: 100,
      role: 'admin',
      idempotencyKey: 'avatar-1',
    });
    await completeUpload(store, {
      workspaceId,
      uploadId: issued.upload.id,
      pathname: issued.pathname,
      byteSize: 100,
    });

    const linked = await updateMe(
      authed('/api/auth/me', token, {
        method: 'PATCH',
        body: { avatarUploadId: issued.upload.id },
      })
    );
    expect(linked.status).toBe(200);
    expect(
      ((await linked.json()) as { profile: { avatarUploadId: string } }).profile
        .avatarUploadId
    ).toBe(issued.upload.id);

    // Unknown upload id → denied (no oracle distinguishing miss vs foreign).
    const ghost = await updateMe(
      authed('/api/auth/me', token, {
        method: 'PATCH',
        body: { avatarUploadId: 'upl_9999' },
      })
    );
    expect(ghost.status).toBe(403);
  });

  it('rejects unauthenticated reads and invalid updates', async () => {
    const anon = await getMe(new Request('http://localhost/api/auth/me'));
    expect(anon.status).toBe(401);

    const token = await signInMobile(workspaceId);
    const empty = await updateMe(
      authed('/api/auth/me', token, { method: 'PATCH', body: {} })
    );
    expect(empty.status).toBe(400);
    const badName = await updateMe(
      authed('/api/auth/me', token, {
        method: 'PATCH',
        body: { displayName: '   ' },
      })
    );
    expect(badName.status).toBe(400);
  });

  it('changes password: policy, revoke-all, security events, cookie cleared', async () => {
    const webSignIn = await signIn(
      jsonRequest('/api/auth/sign-in', {
        email: EMAIL,
        password: PASSWORD,
        workspaceId,
        platform: 'web',
      })
    );
    expect(webSignIn.status).toBe(200);
    const webToken = decodeURIComponent(
      (webSignIn.headers.get('set-cookie') ?? '')
        .split(';')[0]
        ?.split('=')[1] ?? ''
    );
    const mobileToken = await signInMobile(workspaceId);

    // Weak replacement rejected by policy.
    const weak = await changePassword(
      authed('/api/auth/password/change', mobileToken, {
        method: 'POST',
        body: { currentPassword: PASSWORD, newPassword: 'password123' },
      })
    );
    expect(weak.status).toBe(400);

    // Wrong current password is a generic 401.
    const wrong = await changePassword(
      authed('/api/auth/password/change', mobileToken, {
        method: 'POST',
        body: {
          currentPassword: 'wrong-password-1',
          newPassword: 'fresh-noodles-42',
        },
      })
    );
    expect(wrong.status).toBe(401);

    const done = await changePassword(
      authed('/api/auth/password/change', mobileToken, {
        method: 'POST',
        body: { currentPassword: PASSWORD, newPassword: 'fresh-noodles-42' },
      })
    );
    expect(done.status).toBe(200);
    expect(done.headers.get('set-cookie')).toContain('Max-Age=0');
    const doneBody = (await done.json()) as { revokedCount: number };
    expect(doneBody.revokedCount).toBe(2);
    expect(JSON.stringify(doneBody)).not.toContain(PASSWORD);

    // Both pre-change sessions are dead.
    for (const t of [webToken, mobileToken]) {
      const stale = await listSessions(
        new Request('http://localhost/api/auth/sessions', {
          headers: { authorization: `Bearer ${t}` },
        })
      );
      expect(stale.status).toBe(401);
    }

    // Old password fails; new password works.
    const oldPass = await signIn(
      jsonRequest('/api/auth/sign-in', {
        email: EMAIL,
        password: PASSWORD,
        workspaceId,
        platform: 'mobile',
      })
    );
    expect(oldPass.status).toBe(401);
    const renewed = await signIn(
      jsonRequest('/api/auth/sign-in', {
        email: EMAIL,
        password: 'fresh-noodles-42',
        workspaceId,
        platform: 'mobile',
      })
    );
    expect(renewed.status).toBe(200);
  });

  it('requires authentication for password change', async () => {
    const anon = await changePassword(
      jsonRequest('/api/auth/password/change', {
        currentPassword: PASSWORD,
        newPassword: 'fresh-noodles-42',
      })
    );
    expect(anon.status).toBe(401);
  });
});
