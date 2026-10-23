import { beforeEach, describe, expect, it } from 'vitest';
import { __resetAuthForTests, seedFixtureCredential } from '../lib/auth';
import { __resetMembershipForTests } from '../lib/membership';
import { __resetIntegrationsForTests } from '../lib/integrations';
import { POST as signIn } from '../app/api/auth/sign-in/route';
import { POST as createInvite } from '../app/api/workspaces/[workspaceId]/invites/route';
import { POST as acceptInvite } from '../app/api/invites/accept/route';
import {
  GET as listIntegrations,
  POST as startIntegration,
} from '../app/api/workspaces/[workspaceId]/integrations/route';
import { DELETE as disconnectIntegration } from '../app/api/workspaces/[workspaceId]/integrations/[connectionId]/route';
import { GET as listListings } from '../app/api/workspaces/[workspaceId]/integrations/[connectionId]/listings/route';

/**
 * US20 / RFC 04 task 97: integration route access. A non-member gets the
 * neutral 404; Manager and Staff get 403 ROLE_FORBIDDEN on Admin writes;
 * Staff gets 403 on staged listings; every member can read the status list.
 */

const ADMIN_EMAIL = 'owner@fixture.test';
const ADMIN_PASSWORD = 'sari-roti-88!';
const MANAGER_EMAIL = 'manager@fixture.test';
const MANAGER_PASSWORD = 'manager-bakso-77';
const STAFF_EMAIL = 'clerk@fixture.test';
const STAFF_PASSWORD = 'clerk-noodles-99';
const CONNECTION_ID = '00000000-0000-4000-8000-000000000097';

function apiRequest(
  path: string,
  body?: unknown,
  token?: string,
  method = 'POST'
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function errorCode(res: Response): Promise<string> {
  return ((await res.json()) as { errorCode: string }).errorCode;
}

describe('integration routes access (task 97)', () => {
  let workspaceId: string;
  let adminToken: string;
  let managerToken: string;
  let staffToken: string;

  async function signInToken(email: string, password: string): Promise<string> {
    const res = await signIn(
      apiRequest('/api/auth/sign-in', {
        email,
        password,
        workspaceId,
        platform: 'mobile',
      })
    );
    expect(res.status).toBe(200);
    return ((await res.json()) as { token: string }).token;
  }

  async function join(email: string, password: string, role: string) {
    const invited = await createInvite(
      apiRequest(
        `/api/workspaces/${workspaceId}/invites`,
        { email, role },
        adminToken
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(invited.status).toBe(201);
    const { token } = (await invited.json()) as { token: string };
    const accepted = await acceptInvite(
      apiRequest('/api/invites/accept', { token, newPassword: password })
    );
    expect(accepted.status).toBe(200);
    return signInToken(email, password);
  }

  function list(id: string, token: string) {
    return listIntegrations(
      apiRequest(`/api/workspaces/${id}/integrations`, undefined, token, 'GET'),
      { params: Promise.resolve({ workspaceId: id }) }
    );
  }

  beforeEach(async () => {
    __resetAuthForTests();
    __resetMembershipForTests();
    __resetIntegrationsForTests();
    ({ workspaceId } = await seedFixtureCredential({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }));
    adminToken = await signInToken(ADMIN_EMAIL, ADMIN_PASSWORD);
    managerToken = await join(MANAGER_EMAIL, MANAGER_PASSWORD, 'manager');
    staffToken = await join(STAFF_EMAIL, STAFF_PASSWORD, 'staff');
  });

  it('returns the neutral 404 for a workspace the caller is not in', async () => {
    const res = await list('ws_not_a_member', adminToken);
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe('WORKSPACE_NOT_AVAILABLE');
  });

  it('forbids Manager and Staff writes and Staff listing reads', async () => {
    const params = Promise.resolve({ workspaceId });
    const detail = Promise.resolve({
      workspaceId,
      connectionId: CONNECTION_ID,
    });
    const base = `/api/workspaces/${workspaceId}/integrations`;
    for (const token of [managerToken, staffToken]) {
      const start = await startIntegration(
        apiRequest(base, { provider: 'shopee' }, token),
        { params }
      );
      expect(start.status).toBe(403);
      expect(await errorCode(start)).toBe('ROLE_FORBIDDEN');
      const putuskan = await disconnectIntegration(
        apiRequest(`${base}/${CONNECTION_ID}`, undefined, token, 'DELETE'),
        { params: detail }
      );
      expect(putuskan.status).toBe(403);
      expect(await errorCode(putuskan)).toBe('ROLE_FORBIDDEN');
    }
    const listingsPath = `${base}/${CONNECTION_ID}/listings`;
    const staff = await listListings(
      apiRequest(listingsPath, undefined, staffToken, 'GET'),
      { params: detail }
    );
    expect(staff.status).toBe(403);
    expect(await errorCode(staff)).toBe('ROLE_FORBIDDEN');
    const manager = await listListings(
      apiRequest(listingsPath, undefined, managerToken, 'GET'),
      { params: detail }
    );
    expect(manager.status).toBe(404);
    expect(await errorCode(manager)).toBe('CONNECTION_NOT_FOUND');
  });

  it('lets every member read the connection status list', async () => {
    for (const token of [adminToken, managerToken, staffToken]) {
      const res = await list(workspaceId, token);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { connections: unknown[] };
      expect(body.connections).toEqual([]);
    }
  });
});
