import { beforeEach, describe, expect, it } from 'vitest';
import { __resetAuthForTests, seedFixtureCredential } from '../lib/auth';
import { POST as signIn } from '../app/api/auth/sign-in/route';
import { POST as signOut } from '../app/api/auth/sign-out/route';
import { POST as signOutAll } from '../app/api/auth/sign-out-all/route';
import { GET as listRoute } from '../app/api/auth/sessions/route';
import { POST as resetRequest } from '../app/api/auth/password-reset/request/route';
import { POST as resetConfirm } from '../app/api/auth/password-reset/confirm/route';
import { POST as bootstrapUser } from '../app/api/auth/bootstrap-users/route';

/**
 * Auth Route Handler flow (UTA-67) through the memory wiring:
 * sign-in (web cookie vs mobile token) → list → sign-out → sign-out-all,
 * plus password-reset revoke-all, rate-limited failures, and generic
 * failure shapes with no secret leakage.
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

describe('auth routes (memory wiring)', () => {
  let workspaceId: string;

  beforeEach(async () => {
    __resetAuthForTests();
    ({ workspaceId } = await seedFixtureCredential({
      email: EMAIL,
      password: PASSWORD,
    }));
  });

  it('web sign-in sets an HttpOnly cookie and omits the token from JSON', async () => {
    const res = await signIn(
      jsonRequest('/api/auth/sign-in', {
        email: EMAIL,
        password: PASSWORD,
        workspaceId,
        platform: 'web',
        deviceLabel: 'office-chrome',
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['token']).toBeUndefined();
    expect(body['session']).toMatchObject({ platform: 'web' });
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('tb_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=1800');
    // Response-safe: no password, no hash, no email echo of secrets.
    expect(JSON.stringify(body)).not.toContain(PASSWORD);
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|tokenHash/);
  });

  it('bootstraps a workspace Admin only with the configured shared password', async () => {
    process.env['AUTH_BOOTSTRAP_PASSWORD'] = 'local-bootstrap-password-123';
    const body = {
      email: 'new-owner@fixture.test',
      password: 'new-owner-password-123',
      workspaceName: 'New Fixture Store',
    };

    const denied = await bootstrapUser(
      jsonRequest('/api/auth/bootstrap-users', body)
    );
    expect(denied.status).toBe(404);

    const created = await bootstrapUser(
      jsonRequest('/api/auth/bootstrap-users', body, {
        'x-bootstrap-password': process.env['AUTH_BOOTSTRAP_PASSWORD'],
      })
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { workspaceId: string };
    expect(createdBody.workspaceId).toMatch(/^ws_/);

    const signedIn = await signIn(
      jsonRequest('/api/auth/sign-in', {
        email: body.email,
        password: body.password,
        workspaceId: createdBody.workspaceId,
        platform: 'mobile',
      })
    );
    expect(signedIn.status).toBe(200);
    delete process.env['AUTH_BOOTSTRAP_PASSWORD'];
  });

  it('mobile sign-in returns the bearer token and lists sessions', async () => {
    const res = await signIn(
      jsonRequest('/api/auth/sign-in', {
        email: EMAIL,
        password: PASSWORD,
        workspaceId,
        platform: 'mobile',
        deviceLabel: 'expo-android',
      })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      token: string;
      session: { id: string };
    };
    expect(body.token.length).toBeGreaterThan(20);
    expect(res.headers.get('set-cookie')).toBeNull();

    const listed = await listRoute(
      new Request('http://localhost/api/auth/sessions', {
        headers: { authorization: `Bearer ${body.token}` },
      })
    );
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as {
      sessions: Array<{ id: string; platform: string }>;
    };
    expect(listedBody.sessions).toHaveLength(1);
    expect(listedBody.sessions[0]).toMatchObject({
      id: body.session.id,
      platform: 'mobile',
    });
  });

  it('slides the web cookie on activity; bearer callers get no cookie', async () => {
    const webRes = await signIn(
      jsonRequest('/api/auth/sign-in', {
        email: EMAIL,
        password: PASSWORD,
        workspaceId,
        platform: 'web',
      })
    );
    const webToken = decodeURIComponent(
      (webRes.headers.get('set-cookie') ?? '').split(';')[0]?.split('=')[1] ??
        ''
    );
    const listed = await listRoute(
      new Request('http://localhost/api/auth/sessions', {
        headers: { cookie: `tb_session=${encodeURIComponent(webToken)}` },
      })
    );
    expect(listed.status).toBe(200);
    const refreshed = listed.headers.get('set-cookie') ?? '';
    expect(refreshed).toContain('tb_session=');
    expect(refreshed).toContain('Max-Age=1800');

    const mobileRes = await signIn(
      jsonRequest('/api/auth/sign-in', {
        email: EMAIL,
        password: PASSWORD,
        workspaceId,
        platform: 'mobile',
      })
    );
    const mobileToken = ((await mobileRes.json()) as { token: string }).token;
    const bearerListed = await listRoute(
      new Request('http://localhost/api/auth/sessions', {
        headers: { authorization: `Bearer ${mobileToken}` },
      })
    );
    expect(bearerListed.status).toBe(200);
    expect(bearerListed.headers.get('set-cookie')).toBeNull();
  });

  it('unknown email and wrong password share one generic 401 shape', async () => {
    const unknownRes = await signIn(
      jsonRequest('/api/auth/sign-in', {
        email: 'ghost@fixture.test',
        password: 'whatever-123',
        workspaceId,
        platform: 'web',
      })
    );
    const wrongRes = await signIn(
      jsonRequest('/api/auth/sign-in', {
        email: EMAIL,
        password: 'wrong-password-1',
        workspaceId,
        platform: 'web',
      })
    );
    expect(unknownRes.status).toBe(401);
    expect(wrongRes.status).toBe(401);
    const unknownBody = await unknownRes.json();
    expect(unknownBody).toEqual(await wrongRes.json());
    expect(JSON.stringify(unknownBody)).not.toContain('ghost');
  });

  it('rate-limits repeated failures with 429 (same ip)', async () => {
    const headers = { 'x-forwarded-for': '10.9.9.9' };
    for (let i = 0; i < 5; i += 1) {
      const res = await signIn(
        jsonRequest(
          '/api/auth/sign-in',
          {
            email: EMAIL,
            password: 'wrong-password-1',
            workspaceId,
            platform: 'web',
          },
          headers
        )
      );
      expect(res.status).toBe(401);
    }
    const limited = await signIn(
      jsonRequest(
        '/api/auth/sign-in',
        {
          email: EMAIL,
          password: 'wrong-password-1',
          workspaceId,
          platform: 'web',
        },
        headers
      )
    );
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({
      error: 'Too many attempts. Try again later.',
      errorCode: 'RATE_LIMITED',
    });
  });

  it('sign-out revokes this device; sign-out-all revokes the rest', async () => {
    const webRes = await signIn(
      jsonRequest('/api/auth/sign-in', {
        email: EMAIL,
        password: PASSWORD,
        workspaceId,
        platform: 'web',
      })
    );
    const webCookie = webRes.headers.get('set-cookie') ?? '';
    const webToken = decodeURIComponent(
      webCookie.split(';')[0]?.split('=')[1] ?? ''
    );
    const mobileRes = await signIn(
      jsonRequest('/api/auth/sign-in', {
        email: EMAIL,
        password: PASSWORD,
        workspaceId,
        platform: 'mobile',
      })
    );
    const mobileToken = ((await mobileRes.json()) as { token: string }).token;

    const out = await signOut(
      new Request('http://localhost/api/auth/sign-out', {
        method: 'POST',
        headers: { cookie: `tb_session=${encodeURIComponent(webToken)}` },
      })
    );
    expect(out.status).toBe(200);
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0');

    const deadList = await listRoute(
      new Request('http://localhost/api/auth/sessions', {
        headers: { cookie: `tb_session=${encodeURIComponent(webToken)}` },
      })
    );
    expect(deadList.status).toBe(401);

    const all = await signOutAll(
      new Request('http://localhost/api/auth/sign-out-all', {
        method: 'POST',
        headers: { authorization: `Bearer ${mobileToken}` },
      })
    );
    expect(all.status).toBe(200);
    expect(((await all.json()) as { revokedCount: number }).revokedCount).toBe(
      1
    );
    const empty = await listRoute(
      new Request('http://localhost/api/auth/sessions', {
        headers: { authorization: `Bearer ${mobileToken}` },
      })
    );
    expect(empty.status).toBe(401);
  });

  it('password reset revokes all sessions and rotates the password', async () => {
    process.env['AUTH_INCLUDE_RESET_TOKEN'] = 'true';
    try {
      const webRes = await signIn(
        jsonRequest('/api/auth/sign-in', {
          email: EMAIL,
          password: PASSWORD,
          workspaceId,
          platform: 'web',
        })
      );
      const webToken = decodeURIComponent(
        (webRes.headers.get('set-cookie') ?? '').split(';')[0]?.split('=')[1] ??
          ''
      );

      const req = await resetRequest(
        jsonRequest('/api/auth/password-reset/request', { email: EMAIL })
      );
      expect(req.status).toBe(200);
      const { resetToken } = (await req.json()) as { resetToken: string };
      expect(resetToken.length).toBeGreaterThan(20);

      // Unknown emails get the same generic shape, no ticket.
      const ghost = await resetRequest(
        jsonRequest('/api/auth/password-reset/request', {
          email: 'ghost@fixture.test',
        })
      );
      expect(ghost.status).toBe(200);
      expect(
        (await ghost.json()) as Record<string, unknown>
      ).not.toHaveProperty('resetToken');

      // Weak replacement rejected by policy.
      const weak = await resetConfirm(
        jsonRequest('/api/auth/password-reset/confirm', {
          resetToken,
          newPassword: 'password123',
        })
      );
      expect(weak.status).toBe(400);

      const done = await resetConfirm(
        jsonRequest('/api/auth/password-reset/confirm', {
          resetToken,
          newPassword: 'fresh-noodles-42',
        })
      );
      expect(done.status).toBe(200);

      // Pre-reset session is dead; old password fails; new password works.
      const stale = await listRoute(
        new Request('http://localhost/api/auth/sessions', {
          headers: { cookie: `tb_session=${encodeURIComponent(webToken)}` },
        })
      );
      expect(stale.status).toBe(401);
      const oldPass = await signIn(
        jsonRequest('/api/auth/sign-in', {
          email: EMAIL,
          password: PASSWORD,
          workspaceId,
          platform: 'web',
        })
      );
      expect(oldPass.status).toBe(401);
      const renewed = await signIn(
        jsonRequest('/api/auth/sign-in', {
          email: EMAIL,
          password: 'fresh-noodles-42',
          workspaceId,
          platform: 'web',
        })
      );
      expect(renewed.status).toBe(200);

      // Single-use: the same ticket is rejected now.
      const reuse = await resetConfirm(
        jsonRequest('/api/auth/password-reset/confirm', {
          resetToken,
          newPassword: 'another-fresh-43',
        })
      );
      expect(reuse.status).toBe(400);
    } finally {
      delete process.env['AUTH_INCLUDE_RESET_TOKEN'];
    }
  });
});
