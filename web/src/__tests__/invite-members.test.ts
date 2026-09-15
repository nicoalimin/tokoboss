import { beforeEach, describe, expect, it } from 'vitest';
import { __resetAuthForTests, seedFixtureCredential } from '../lib/auth';
import { __resetMembershipForTests } from '../lib/membership';
import { POST as signIn } from '../app/api/auth/sign-in/route';
import { GET as listSessions } from '../app/api/auth/sessions/route';
import {
  GET as listInvites,
  POST as createInvite,
} from '../app/api/workspaces/[workspaceId]/invites/route';
import { DELETE as revokeInvite } from '../app/api/workspaces/[workspaceId]/invites/[inviteId]/route';
import { POST as acceptInvite } from '../app/api/invites/accept/route';
import { GET as listMembers } from '../app/api/workspaces/[workspaceId]/members/route';
import { PATCH as updateMember } from '../app/api/workspaces/[workspaceId]/members/[userId]/route';
import { POST as deactivateMember } from '../app/api/workspaces/[workspaceId]/members/[userId]/deactivate/route';

/**
 * Invite + membership Route Handler flow (UTA-70) through the memory
 * wiring: Admin create → token accept → list/update/deactivate, with
 * RBAC, cross-workspace deny, last-Admin, expiry, and session-revoke
 * parity asserted at the HTTP boundary.
 */

const ADMIN_EMAIL = 'owner@fixture.test';
const ADMIN_PASSWORD = 'sari-roti-88!';
const STAFF_EMAIL = 'clerk@fixture.test';
const STAFF_PASSWORD = 'clerk-noodles-99';

function apiRequest(
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
  method = 'POST'
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('invite + membership routes (memory wiring)', () => {
  let workspaceId: string;
  let adminToken: string;
  let adminUserId: string;

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
    const body = (await res.json()) as { token: string; userId: string };
    if (email === ADMIN_EMAIL) adminUserId = body.userId;
    return body.token;
  }

  async function createStaffInvite(
    role: 'staff' | 'manager' | 'admin' = 'staff'
  ): Promise<{ inviteId: string; token: string }> {
    const res = await createInvite(
      apiRequest(
        `/api/workspaces/${workspaceId}/invites`,
        {
          email: STAFF_EMAIL,
          role,
          ...(role === 'admin' ? {} : { warehouseScope: null }),
        },
        bearer(adminToken)
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      invite: { id: string };
      token: string;
    };
    return { inviteId: body.invite.id, token: body.token };
  }

  beforeEach(async () => {
    __resetAuthForTests();
    __resetMembershipForTests();
    ({ workspaceId } = await seedFixtureCredential({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }));
    adminToken = await signInToken(ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  it('Admin creates a scoped Manager invite; views never leak hashes', async () => {
    const res = await createInvite(
      apiRequest(
        `/api/workspaces/${workspaceId}/invites`,
        {
          email: 'manager@fixture.test',
          role: 'manager',
          warehouseScope: 'wh_jkt_1',
        },
        bearer(adminToken)
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      invite: Record<string, unknown>;
      token: string;
    };
    expect(body.invite).toMatchObject({
      workspaceId,
      email: 'manager@fixture.test',
      role: 'manager',
      warehouseScope: 'wh_jkt_1',
      status: 'pending',
    });
    expect(body.token.length).toBeGreaterThan(20);
    expect(JSON.stringify(body)).not.toMatch(/tokenHash|passwordHash/);

    const listed = await listInvites(
      apiRequest(
        `/api/workspaces/${workspaceId}/invites`,
        undefined,
        bearer(adminToken)
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as {
      invites: Array<{ email: string }>;
    };
    expect(listedBody.invites.map((i) => i.email)).toContain(
      'manager@fixture.test'
    );
  });

  it('rejects Admin-with-scope and unknown roles at the boundary', async () => {
    const scopedAdmin = await createInvite(
      apiRequest(
        `/api/workspaces/${workspaceId}/invites`,
        {
          email: 'boss2@fixture.test',
          role: 'admin',
          warehouseScope: 'wh_jkt_1',
        },
        bearer(adminToken)
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(scopedAdmin.status).toBe(400);
    const badRole = await createInvite(
      apiRequest(
        `/api/workspaces/${workspaceId}/invites`,
        { email: 'x@fixture.test', role: 'viewer' },
        bearer(adminToken)
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(badRole.status).toBe(400);
  });

  it('accept creates/activates the membership; reuse and garbage rejected', async () => {
    const { token } = await createStaffInvite();
    const accepted = await acceptInvite(
      apiRequest('/api/invites/accept', {
        token,
        newPassword: STAFF_PASSWORD,
      })
    );
    expect(accepted.status).toBe(200);
    const acceptedBody = (await accepted.json()) as {
      member: Record<string, unknown>;
      userId: string;
      isNewUser: boolean;
    };
    expect(acceptedBody.member).toMatchObject({
      workspaceId,
      role: 'staff',
      status: 'active',
      authVersion: 1,
    });
    expect(acceptedBody.isNewUser).toBe(true);
    const staffUserId = acceptedBody.userId;

    // The provisioned credential signs in.
    const staffToken = await signInToken(STAFF_EMAIL, STAFF_PASSWORD);
    expect(staffToken.length).toBeGreaterThan(20);

    // Reusing a consumed ticket is a generic 404.
    const reuse = await acceptInvite(
      apiRequest('/api/invites/accept', { token })
    );
    expect(reuse.status).toBe(404);
    const reuseBody = await reuse.json();
    expect(reuseBody).toEqual({
      error: 'Invite is invalid.',
      errorCode: 'INVITE_INVALID',
    });

    // Garbage tokens share the same shape (no enumeration oracle).
    const garbage = await acceptInvite(
      apiRequest('/api/invites/accept', { token: 'no-such-ticket' })
    );
    expect(garbage.status).toBe(404);
    expect(await garbage.json()).toEqual(reuseBody);

    // Membership is listed for Admins.
    const members = await listMembers(
      apiRequest(
        `/api/workspaces/${workspaceId}/members`,
        undefined,
        bearer(adminToken)
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(members.status).toBe(200);
    const memberIds = (
      (await members.json()) as { members: Array<{ userId: string }> }
    ).members.map((m) => m.userId);
    expect(memberIds).toContain(staffUserId);
  });

  it('expires short-lived tickets with 410', async () => {
    const created = await createInvite(
      apiRequest(
        `/api/workspaces/${workspaceId}/invites`,
        { email: 'stale@fixture.test', role: 'staff', ttlMs: 1 },
        bearer(adminToken)
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(created.status).toBe(201);
    const { token } = (await created.json()) as { token: string };
    await new Promise((r) => setTimeout(r, 10));
    const res = await acceptInvite(
      apiRequest('/api/invites/accept', { token })
    );
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({
      error: 'Invite has expired.',
      errorCode: 'INVITE_EXPIRED',
    });
  });

  it('revokes pending invites; accept after revoke is 404', async () => {
    const { inviteId, token } = await createStaffInvite();
    const revoked = await revokeInvite(
      apiRequest(
        `/api/workspaces/${workspaceId}/invites/${inviteId}`,
        undefined,
        bearer(adminToken)
      ),
      { params: Promise.resolve({ workspaceId, inviteId }) }
    );
    expect(revoked.status).toBe(200);
    const after = await acceptInvite(
      apiRequest('/api/invites/accept', { token })
    );
    expect(after.status).toBe(404);
  });

  it('updates role/scope with auth_version bump; guards the last Admin', async () => {
    const { token } = await createStaffInvite();
    const accepted = (await (
      await acceptInvite(apiRequest('/api/invites/accept', { token }))
    ).json()) as { userId: string };

    const patched = await updateMember(
      apiRequest(
        `/api/workspaces/${workspaceId}/members/${accepted.userId}`,
        { role: 'manager', warehouseScope: 'wh_jkt_1' },
        bearer(adminToken)
      ),
      {
        params: Promise.resolve({
          workspaceId,
          userId: accepted.userId,
        }),
      }
    );
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({
      member: {
        role: 'manager',
        warehouseScope: 'wh_jkt_1',
        authVersion: 2,
      },
    });

    // Reduce to a single Admin (deactivate the seed admin), then
    // demoting/deactivating the last Admin must 409.
    const members = (await (
      await listMembers(
        apiRequest(
          `/api/workspaces/${workspaceId}/members`,
          undefined,
          bearer(adminToken)
        ),
        { params: Promise.resolve({ workspaceId }) }
      )
    ).json()) as { members: Array<{ userId: string; role: string }> };
    const seedAdmin = members.members.find(
      (m) => m.role === 'admin' && m.userId !== adminUserId
    );
    expect(seedAdmin).toBeDefined();
    const removedSeed = await deactivateMember(
      apiRequest(
        `/api/workspaces/${workspaceId}/members/${seedAdmin!.userId}/deactivate`,
        {},
        bearer(adminToken)
      ),
      {
        params: Promise.resolve({
          workspaceId,
          userId: seedAdmin!.userId,
        }),
      }
    );
    expect(removedSeed.status).toBe(200);

    const demote = await updateMember(
      apiRequest(
        `/api/workspaces/${workspaceId}/members/${adminUserId}`,
        { role: 'staff' },
        bearer(adminToken)
      ),
      { params: Promise.resolve({ workspaceId, userId: adminUserId }) }
    );
    expect(demote.status).toBe(409);
    expect(await demote.json()).toEqual({
      error: 'Cannot remove or deactivate the last active Admin',
      errorCode: 'TENANCY_LAST_ADMIN',
    });

    const deactivateSelf = await deactivateMember(
      apiRequest(
        `/api/workspaces/${workspaceId}/members/${adminUserId}/deactivate`,
        {},
        bearer(adminToken)
      ),
      { params: Promise.resolve({ workspaceId, userId: adminUserId }) }
    );
    expect(deactivateSelf.status).toBe(409);
  });

  it('deactivates with session revoke: sessions die and sign-in fails', async () => {
    const { token } = await createStaffInvite();
    await acceptInvite(
      apiRequest('/api/invites/accept', {
        token,
        newPassword: STAFF_PASSWORD,
      })
    );
    const staffToken = await signInToken(STAFF_EMAIL, STAFF_PASSWORD);
    const before = await listSessions(
      apiRequest('/api/auth/sessions', undefined, bearer(staffToken))
    );
    expect(before.status).toBe(200);

    const staffId = (
      (await (
        await listMembers(
          apiRequest(
            `/api/workspaces/${workspaceId}/members`,
            undefined,
            bearer(adminToken)
          ),
          { params: Promise.resolve({ workspaceId }) }
        )
      ).json()) as { members: Array<{ userId: string; role: string }> }
    ).members.find((m) => m.role === 'staff')!.userId;

    const deactivated = await deactivateMember(
      apiRequest(
        `/api/workspaces/${workspaceId}/members/${staffId}/deactivate`,
        {},
        bearer(adminToken)
      ),
      { params: Promise.resolve({ workspaceId, userId: staffId }) }
    );
    expect(deactivated.status).toBe(200);
    expect(await deactivated.json()).toMatchObject({
      member: { status: 'deactivated', authVersion: 2 },
    });

    // Pre-deactivate sessions are revoked server-side (UTA-67 parity).
    const after = await listSessions(
      apiRequest('/api/auth/sessions', undefined, bearer(staffToken))
    );
    expect(after.status).toBe(401);
    const relogin = await signIn(
      apiRequest('/api/auth/sign-in', {
        email: STAFF_EMAIL,
        password: STAFF_PASSWORD,
        workspaceId,
        platform: 'mobile',
      })
    );
    expect(relogin.status).toBe(401);
  });

  it('enforces RBAC + cross-workspace deny on every management route', async () => {
    const { workspaceId: otherWs } = await seedFixtureCredential({
      email: 'other@fixture.test',
      password: 'other-noodles-11',
    });

    // Admin of A acting on B: generic 403 everywhere.
    const crossList = await listMembers(
      apiRequest(
        `/api/workspaces/${otherWs}/members`,
        undefined,
        bearer(adminToken)
      ),
      { params: Promise.resolve({ workspaceId: otherWs }) }
    );
    expect(crossList.status).toBe(403);
    const crossCreate = await createInvite(
      apiRequest(
        `/api/workspaces/${otherWs}/invites`,
        { email: 'evil@fixture.test', role: 'staff' },
        bearer(adminToken)
      ),
      { params: Promise.resolve({ workspaceId: otherWs }) }
    );
    expect(crossCreate.status).toBe(403);

    // Staff member of A cannot manage.
    const { token } = await createStaffInvite();
    await acceptInvite(
      apiRequest('/api/invites/accept', {
        token,
        newPassword: STAFF_PASSWORD,
      })
    );
    const staffToken = await signInToken(STAFF_EMAIL, STAFF_PASSWORD);
    const staffCreate = await createInvite(
      apiRequest(
        `/api/workspaces/${workspaceId}/invites`,
        { email: 'nope@fixture.test', role: 'staff' },
        bearer(staffToken)
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(staffCreate.status).toBe(403);
    const staffList = await listMembers(
      apiRequest(
        `/api/workspaces/${workspaceId}/members`,
        undefined,
        bearer(staffToken)
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(staffList.status).toBe(403);

    // Missing session is 401 (not 403).
    const anon = await listMembers(
      apiRequest(`/api/workspaces/${workspaceId}/members`),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(anon.status).toBe(401);
  });

  it('keeps tokens, hashes, and passwords out of management responses', async () => {
    const { token } = await createStaffInvite('manager');
    const accepted = await acceptInvite(
      apiRequest('/api/invites/accept', {
        token,
        newPassword: STAFF_PASSWORD,
      })
    );
    const acceptedBody = await accepted.json();
    const wire = JSON.stringify({
      created: token,
      accepted: acceptedBody,
      members: await (
        await listMembers(
          apiRequest(
            `/api/workspaces/${workspaceId}/members`,
            undefined,
            bearer(adminToken)
          ),
          { params: Promise.resolve({ workspaceId }) }
        )
      ).json(),
    });
    expect(wire).not.toContain(STAFF_PASSWORD);
    expect(wire).not.toMatch(/tokenHash|passwordHash/);
    // The raw invite token appears only where the Admin was given it once
    // (create response echoed above as `created`) — never inside member or
    // accept projections.
    const acceptOnly = JSON.stringify(acceptedBody);
    expect(acceptOnly).not.toContain(token);
  });
});
