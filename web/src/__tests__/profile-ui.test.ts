import { describe, expect, it, vi } from 'vitest';
import {
  ProfileClientError,
  changePassword,
  getProfile,
  toProfileClientError,
  updateProfile,
} from '../lib/profile-client';
import { getProfileCopy, profileCopyKeys } from '../lib/profile-copy';

/**
 * Web Profil UI client (UTA-73): happy paths over the UTA-72 APIs,
 * re-auth mapping, password-policy passthrough, and no-secret error shapes.
 */

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(
  impl: (url: string, init?: RequestInit) => Promise<Response>
) {
  return vi.fn(impl) as unknown as typeof fetch & {
    mock: { calls: Array<[string, RequestInit?]> };
  };
}

describe('profile-client (UTA-73 UI)', () => {
  it('reads and updates the profile over cookies with no target user', async () => {
    const seen: Array<[string, RequestInit?]> = [];
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      seen.push([url, init]);
      if (String(url) === '/api/auth/me' && !init?.method) {
        return jsonResponse(
          {
            profile: {
              userId: 'u1',
              email: 'owner@fixture.test',
              displayName: null,
              avatarUploadId: null,
              updatedAt: new Date().toISOString(),
            },
          },
          200
        );
      }
      if (String(url) === '/api/auth/me' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({ displayName: 'Budi Santoso' });
        expect(body).not.toHaveProperty('userId');
        return jsonResponse(
          {
            profile: {
              userId: 'u1',
              email: 'owner@fixture.test',
              displayName: 'Budi Santoso',
              avatarUploadId: null,
              updatedAt: new Date().toISOString(),
            },
          },
          200
        );
      }
      return jsonResponse({}, 404);
    });

    const me = await getProfile({ fetchFn });
    expect(me.email).toBe('owner@fixture.test');
    const updated = await updateProfile(
      { displayName: 'Budi Santoso' },
      { fetchFn }
    );
    expect(updated.displayName).toBe('Budi Santoso');
    expect(seen.every(([, init]) => init?.credentials === 'same-origin')).toBe(
      true
    );
    expect(JSON.stringify({ me, updated })).not.toMatch(
      /passwordHash|tokenHash/
    );
  });

  it('sends avatar references as opaque ids, never bytes or urls', async () => {
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      expect(url).toBe('/api/auth/me');
      expect(init?.method).toBe('PATCH');
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(typeof body['avatarUploadId']).toBe('string');
      expect(String(body['avatarUploadId'])).not.toMatch(/^https?:\/\//);
      return jsonResponse(
        {
          profile: {
            userId: 'u1',
            email: 'owner@fixture.test',
            displayName: 'Budi',
            avatarUploadId: body['avatarUploadId'],
            updatedAt: new Date().toISOString(),
          },
        },
        200
      );
    });
    const updated = await updateProfile(
      { avatarUploadId: 'upl_123' },
      { fetchFn }
    );
    expect(updated.avatarUploadId).toBe('upl_123');
  });

  it('changes password then reports the revoked count (caller re-auths)', async () => {
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      expect(url).toBe('/api/auth/password/change');
      expect(init?.method).toBe('POST');
      expect(init?.credentials).toBe('same-origin');
      const body = JSON.parse(String(init?.body));
      expect(Object.keys(body).sort()).toEqual(
        ['currentPassword', 'newPassword'].sort()
      );
      return jsonResponse({ ok: true, revokedCount: 2 }, 200);
    });
    const { revokedCount } = await changePassword(
      { currentPassword: 'sari-roti-88!', newPassword: 'fresh-noodles-42' },
      { fetchFn }
    );
    expect(revokedCount).toBe(2);
  });

  it('maps invalid sessions to re-auth and wrong passwords generically', async () => {
    const expired = toProfileClientError(
      401,
      { error: 'Session is expired.', errorCode: 'INVALID_SESSION' },
      'en'
    );
    expect(expired.needsReauth).toBe(true);
    expect(expired.message).toBe(getProfileCopy('en').expiredNotice);

    const wrong = toProfileClientError(
      401,
      { error: 'Invalid credentials.', errorCode: 'INVALID_CREDENTIALS' },
      'en'
    );
    expect(wrong.needsReauth).toBe(false);
    expect(wrong.message).toBe(getProfileCopy('en').validationError);
  });

  it('passes policy detail through, maps forbidden without echoing ids', async () => {
    const weak = toProfileClientError(
      400,
      { error: 'Too common.', errorCode: 'PASSWORD_POLICY' },
      'en'
    );
    expect(weak.errorCode).toBe('PASSWORD_POLICY');

    const forbidden = toProfileClientError(
      403,
      { errorCode: 'PROFILE_FORBIDDEN' },
      'en'
    );
    expect(forbidden.message).toBe(getProfileCopy('en').forbiddenError);
    expect(forbidden.message).not.toContain('upl_9999');
  });

  it('thrown errors never echo emails, ids, or passwords', async () => {
    const email = 'owner@fixture.test';
    const fetchFn = stubFetch(async () =>
      jsonResponse(
        { error: 'Invalid request.', errorCode: 'AUTH_VALIDATION' },
        400
      )
    );
    const err = await updateProfile(
      { displayName: 'Budi Santoso' },
      { fetchFn }
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProfileClientError);
    const message = (err as ProfileClientError).message;
    expect(message).toBe(getProfileCopy('en').validationError);
    expect(message).not.toContain(email);
    expect(JSON.stringify(err)).not.toMatch(/passwordHash|tokenHash/);

    const pwErr = await changePassword(
      { currentPassword: 'sari-roti-88!', newPassword: 'fresh-noodles-42' },
      {
        fetchFn: stubFetch(async () =>
          jsonResponse(
            { error: 'Invalid credentials.', errorCode: 'INVALID_CREDENTIALS' },
            401
          )
        ),
      }
    ).catch((e: unknown) => e);
    expect(pwErr).toBeInstanceOf(ProfileClientError);
    expect((pwErr as ProfileClientError).message).not.toContain(
      'fresh-noodles-42'
    );
  });

  it('en/id copy stays in sync with no secret or absolute-expiry wording', () => {
    const en = getProfileCopy('en');
    const id = getProfileCopy('id');
    expect(Object.keys(id).sort()).toEqual(profileCopyKeys().sort());
    for (const key of profileCopyKeys()) {
      for (const text of [en[key], id[key]]) {
        expect(text).not.toMatch(/passwordHash|tokenHash|Bearer|tb_session/);
        expect(text).not.toMatch(/absolute/i);
      }
    }
    expect(`${en.expiredNotice} ${id.expiredNotice}`).not.toMatch(
      /valid for \d+|expires in \d+|berlaku selama \d+/i
    );
  });
});
