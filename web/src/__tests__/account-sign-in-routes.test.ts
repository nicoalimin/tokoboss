import { beforeEach, describe, expect, it } from 'vitest';
import { __resetAuthForTests, seedFixtureCredential } from '../lib/auth';
import { __resetMembershipForTests } from '../lib/membership';
import { POST as signIn } from '../app/api/auth/sign-in/route';
import { GET as getMembership } from '../app/api/auth/membership/route';
import { GET as listMembers } from '../app/api/workspaces/[workspaceId]/members/route';

/**
 * US29 / RFC 02 row 35 — route tests for account sign-in (row 32), the
 * mobile workspace-bound path (regression), and neutral 404 vs role 403
 * parity across `/api/auth/membership?workspaceId=` (row 34) and
 * `requireWorkspaceAdmin` routes (row 31).
 */

const OWNER_EMAIL = 'owner@account.test';
const OWNER_PASSWORD = 'sari-roti-88!';
const CLERK_EMAIL = 'clerk@account.test';
const CLERK_PASSWORD = 'clerk-noodles-99';
const NOT_AVAILABLE = {
  error: 'Workspace tidak tersedia.',
  errorCode: 'WORKSPACE_NOT_AVAILABLE',
};

function apiRequest(
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Request {
  return new Request(`http://localhost${path}`, {
    method: body !== undefined ? 'POST' : 'GET',
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

async function signInBody(body: Record<string, unknown>) {
  const res = await signIn(apiRequest('/api/auth/sign-in', body));
  expect(res.status).toBe(200);
  return {
    res,
    body: (await res.json()) as Record<string, unknown> & { token?: string },
  };
}

describe('account sign-in + workspace access routes (memory wiring)', () => {
  let ownerWs: string;
  let clerkWs: string;

  beforeEach(async () => {
    __resetAuthForTests();
    __resetMembershipForTests();
    ({ workspaceId: ownerWs } = await seedFixtureCredential({
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
    }));
    ({ workspaceId: clerkWs } = await seedFixtureCredential({
      email: CLERK_EMAIL,
      password: CLERK_PASSWORD,
      role: 'staff',
    }));
  });

  it('web sign-in without workspaceId opens an account session + landing', async () => {
    const { res, body } = await signInBody({
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
      platform: 'web',
    });
    expect(body.workspaceId).toBeNull();
    expect(body.landing).toEqual({ kind: 'workspace', workspaceId: ownerWs });
    expect(body.token).toBeUndefined();
    expect(res.headers.get('set-cookie') ?? '').toMatch(/tb_session=/);

    const bad = await signIn(
      apiRequest('/api/auth/sign-in', {
        email: OWNER_EMAIL,
        password: 'wrong-password-1',
        platform: 'web',
      })
    );
    expect(bad.status).toBe(401);
  });

  it('mobile sign-in with workspaceId stays workspace-bound (regression)', async () => {
    const { body } = await signInBody({
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
      workspaceId: ownerWs,
      platform: 'mobile',
    });
    expect(body.workspaceId).toBe(ownerWs);
    expect(body.landing).toBeUndefined();
    expect(typeof body.token).toBe('string');

    const me = await getMembership(
      apiRequest('/api/auth/membership', undefined, bearer(body.token!))
    );
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as {
      membership: { workspaceId: string; role: string };
    };
    expect(meBody.membership).toMatchObject({
      workspaceId: ownerWs,
      role: 'admin',
    });
  });

  it('non-member and unknown ids get one neutral 404; members without the role get 403', async () => {
    const { body: account } = await signInBody({
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD,
      platform: 'mobile',
    });
    const token = account.token!;
    const read = (ws: string) =>
      getMembership(
        apiRequest(
          `/api/auth/membership?workspaceId=${ws}`,
          undefined,
          bearer(token)
        )
      );

    const own = await read(ownerWs);
    expect(own.status).toBe(200);
    const ownBody = (await own.json()) as { membership: { role: string } };
    expect(ownBody.membership.role).toBe('admin');

    for (const ws of [clerkWs, 'ws_unknown', '%20']) {
      const denied = await read(ws);
      expect(denied.status).toBe(404);
      expect(await denied.json()).toEqual(NOT_AVAILABLE);
    }
    const noSession = await getMembership(
      apiRequest(`/api/auth/membership?workspaceId=${ownerWs}`)
    );
    expect(noSession.status).toBe(401);

    const crossAdmin = await listMembers(
      apiRequest(
        `/api/workspaces/${clerkWs}/members`,
        undefined,
        bearer(token)
      ),
      { params: Promise.resolve({ workspaceId: clerkWs }) }
    );
    expect(crossAdmin.status).toBe(404);
    expect(await crossAdmin.json()).toEqual(NOT_AVAILABLE);

    const { body: clerk } = await signInBody({
      email: CLERK_EMAIL,
      password: CLERK_PASSWORD,
      workspaceId: clerkWs,
      platform: 'mobile',
    });
    const staffList = await listMembers(
      apiRequest(
        `/api/workspaces/${clerkWs}/members`,
        undefined,
        bearer(clerk.token!)
      ),
      { params: Promise.resolve({ workspaceId: clerkWs }) }
    );
    expect(staffList.status).toBe(403);
    expect(await staffList.json()).toMatchObject({
      errorCode: 'TENANCY_FORBIDDEN',
    });
  });
});
