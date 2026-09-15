import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AuthClientError,
  confirmPasswordReset,
  listSessions,
  requestPasswordReset,
  signIn,
  signOut,
  signOutAll,
  toAuthClientError,
} from '../lib/auth-client';
import { authCopyKeys, getAuthCopy } from '../lib/auth-copy';

/**
 * Web auth UI client (UTA-69): happy paths + failed sign-in
 * non-enumeration, idle re-auth mapping, and no-secret error shapes.
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

describe('auth-client (UTA-69 UI)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('sign-in posts platform web with cookies and returns the session', async () => {
    const fetchFn = stubFetch(async () =>
      jsonResponse(
        { session: { id: 's1' }, userId: 'u1', workspaceId: 'ws1' },
        200
      )
    );
    const result = await signIn(
      {
        email: ' owner@fixture.test ',
        password: 'sari-roti-88!',
        workspaceId: 'ws1',
      },
      { fetchFn }
    );
    expect(result).toMatchObject({ userId: 'u1', workspaceId: 'ws1' });
    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe('/api/auth/sign-in');
    expect(init?.credentials).toBe('same-origin');
    expect(JSON.parse(String(init?.body))).toMatchObject({ platform: 'web' });
  });

  it('unknown email and wrong password map to the same generic 401', async () => {
    const unknown = toAuthClientError(
      401,
      { error: 'Invalid email or password.', errorCode: 'INVALID_CREDENTIALS' },
      'en'
    );
    const wrong = toAuthClientError(
      401,
      { error: 'Invalid email or password.', errorCode: 'INVALID_CREDENTIALS' },
      'en'
    );
    expect(unknown.message).toBe(wrong.message);
    expect(unknown.message).toBe(getAuthCopy('en').genericSignInError);
    expect(unknown.message).not.toContain('ghost@fixture.test');
    expect(unknown.needsReauth).toBe(false);
  });

  it('thrown sign-in errors never echo the email or password', async () => {
    const email = 'owner@fixture.test';
    const fetchFn = stubFetch(async () =>
      jsonResponse(
        {
          error: 'Invalid email or password.',
          errorCode: 'INVALID_CREDENTIALS',
        },
        401
      )
    );
    const err = await signIn(
      { email, password: 'wrong-password-1', workspaceId: 'ws1' },
      { fetchFn }
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthClientError);
    const message = (err as AuthClientError).message;
    expect(message).toBe(getAuthCopy('en').genericSignInError);
    expect(message).not.toContain(email);
    expect(message).not.toContain('wrong-password-1');
    expect(JSON.stringify(err)).not.toMatch(/passwordHash|tokenHash/);
  });

  it('invalid sessions flag re-auth (idle / revoked / auth-stale)', async () => {
    const err = toAuthClientError(
      401,
      {
        error: 'Session is expired. Sign in again.',
        errorCode: 'INVALID_SESSION',
      },
      'en'
    );
    expect(err.needsReauth).toBe(true);
    expect(err.message).toBe(getAuthCopy('en').expiredNotice);
  });

  it('list → sign-out → sign-out-all happy path uses cookies, no tokens', async () => {
    const calls: string[] = [];
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      calls.push(String(url));
      if (String(url) === '/api/auth/sessions' && !init?.method) {
        return jsonResponse({ sessions: [{ id: 's1', platform: 'web' }] }, 200);
      }
      if (String(url) === '/api/auth/sign-out')
        return jsonResponse({ ok: true }, 200);
      if (String(url) === '/api/auth/sign-out-all') {
        return jsonResponse({ ok: true, revokedCount: 1 }, 200);
      }
      return jsonResponse({}, 404);
    });

    const sessions = await listSessions({ fetchFn });
    expect(sessions).toHaveLength(1);
    expect(JSON.stringify(sessions)).not.toMatch(/token|passwordHash/);
    await signOut({ fetchFn });
    const { revokedCount } = await signOutAll({ fetchFn });
    expect(revokedCount).toBe(1);
    expect(calls).toEqual([
      '/api/auth/sessions',
      '/api/auth/sign-out',
      '/api/auth/sign-out-all',
    ]);
  });

  it('password-reset request is generic; confirm rejects weak passwords client-side', async () => {
    const fetchFn = stubFetch(async () =>
      jsonResponse({ ok: true, message: 'If the email exists…' }, 200)
    );
    const { message } = await requestPasswordReset('ghost@fixture.test', {
      fetchFn,
    });
    expect(message).toBe(getAuthCopy('en').forgotDone);
    expect(message).not.toContain('ghost');

    const serverWeak = await confirmPasswordReset(
      { resetToken: 't', newPassword: 'password123' },
      {
        fetchFn: stubFetch(async () =>
          jsonResponse(
            { error: 'Too common.', errorCode: 'PASSWORD_POLICY' },
            400
          )
        ),
      }
    ).catch((e: unknown) => e);
    expect(serverWeak).toBeInstanceOf(AuthClientError);
    expect((serverWeak as AuthClientError).errorCode).toBe('PASSWORD_POLICY');
  });

  it('en/id copy stays in sync with no secret or absolute-expiry wording', () => {
    const en = getAuthCopy('en');
    const id = getAuthCopy('id');
    expect(Object.keys(id).sort()).toEqual(authCopyKeys().sort());
    for (const key of authCopyKeys()) {
      for (const text of [en[key], id[key]]) {
        expect(text).not.toMatch(/passwordHash|tokenHash|Bearer/);
        expect(text).not.toMatch(/absolute/i);
      }
    }
    // Idle is described as inactivity, never "valid for N minutes".
    expect(`${en.sessionsSubtitle} ${id.sessionsSubtitle}`).not.toMatch(
      /valid for \d+|expires in \d+|berlaku selama \d+/i
    );
  });
});
