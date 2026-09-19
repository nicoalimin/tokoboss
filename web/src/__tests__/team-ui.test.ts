import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TeamClientError,
  acceptInvite,
  countActiveAdmins,
  createInvite,
  deactivateMember,
  isLastActiveAdmin,
  listInvites,
  listMembers,
  normalizeScope,
  revokeInvite,
  toTeamClientError,
  updateMember,
  validateScopeForRole,
  type MemberView,
} from '../lib/team-client';
import { getTeamCopy, teamCopyKeys } from '../lib/team-copy';

/**
 * Web Tim & Akses UI client (UTA-71): happy paths over the UTA-70 APIs,
 * last-Admin + scope safeguards, and no-secret error shapes.
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

describe('team-client (UTA-71 UI)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists members and invites over cookies with the workspace in the path', async () => {
    const seen: Array<[string, RequestInit?]> = [];
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      seen.push([url, init]);
      if (url === '/api/workspaces/ws_1/members') {
        return jsonResponse(
          { members: [{ userId: 'u1', role: 'admin' }] },
          200
        );
      }
      if (url === '/api/workspaces/ws_1/invites') {
        return jsonResponse(
          { invites: [{ id: 'i1', status: 'pending' }] },
          200
        );
      }
      return jsonResponse({}, 404);
    });
    const members = await listMembers('ws_1', { fetchFn });
    const invites = await listInvites('ws_1', { fetchFn });
    expect(members).toHaveLength(1);
    expect(invites).toHaveLength(1);
    expect(seen.every(([, init]) => init?.credentials === 'same-origin')).toBe(
      true
    );
    expect(JSON.stringify({ members, invites })).not.toMatch(
      /tokenHash|passwordHash/
    );
  });

  it('creates an invite with normalized scope and returns the once-only token', async () => {
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      expect(url).toBe('/api/workspaces/ws_1/invites');
      expect(init?.method).toBe('POST');
      expect(init?.credentials).toBe('same-origin');
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        email: 'clerk@toko.id',
        role: 'staff',
        warehouseScope: null,
      });
      return jsonResponse(
        { invite: { id: 'i1', email: 'clerk@toko.id' }, token: 'once-only' },
        201
      );
    });
    const result = await createInvite(
      'ws_1',
      { email: 'clerk@toko.id', role: 'staff', warehouseScope: '   ' },
      { fetchFn }
    );
    expect(result.token).toBe('once-only');
    expect(result.invite.id).toBe('i1');
  });

  it('updates role/scope then deactivates and revokes with the right methods', async () => {
    const calls: string[] = [];
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/members/u9'))
        return jsonResponse({ member: { userId: 'u9', role: 'manager' } }, 200);
      if (url.endsWith('/members/u9/deactivate'))
        return jsonResponse(
          { member: { userId: 'u9', status: 'deactivated' } },
          200
        );
      if (url.endsWith('/invites/i9'))
        return jsonResponse({ revoked: true }, 200);
      return jsonResponse({}, 404);
    });
    const updated = await updateMember(
      'ws_1',
      'u9',
      { role: 'manager', warehouseScope: 'wh_jkt_1' },
      { fetchFn }
    );
    expect(updated.role).toBe('manager');
    const deactivated = await deactivateMember('ws_1', 'u9', { fetchFn });
    expect(deactivated.status).toBe('deactivated');
    await revokeInvite('ws_1', 'i9', { fetchFn });
    expect(calls).toEqual([
      'PATCH /api/workspaces/ws_1/members/u9',
      'POST /api/workspaces/ws_1/members/u9/deactivate',
      'DELETE /api/workspaces/ws_1/invites/i9',
    ]);
  });

  it('accepts an invite without echoing the ticket', async () => {
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      expect(url).toBe('/api/invites/accept');
      const body = JSON.parse(String(init?.body));
      expect(body.token).toBe('ticket-abc');
      expect(JSON.stringify(body)).not.toMatch(/tokenHash|passwordHash/);
      return jsonResponse(
        { member: { userId: 'u2' }, userId: 'u2', workspaceId: 'ws_1' },
        200
      );
    });
    const result = await acceptInvite(
      { token: 'ticket-abc', newPassword: 'clerk-noodles-99' },
      { fetchFn }
    );
    expect(result.workspaceId).toBe('ws_1');
    expect(JSON.stringify(result)).not.toContain('ticket-abc');
  });

  it('maps last-Admin, conflict, invalid, and expired to dedicated copy', async () => {
    expect(
      toTeamClientError(
        409,
        {
          error: 'Cannot remove or deactivate the last active Admin',
          errorCode: 'TENANCY_LAST_ADMIN',
        },
        'en'
      ).message
    ).toBe(getTeamCopy('en').lastAdminError);
    expect(
      toTeamClientError(409, { errorCode: 'INVITE_CONFLICT' }, 'en').message
    ).toBe(getTeamCopy('en').inviteConflictError);
    expect(
      toTeamClientError(404, { errorCode: 'INVITE_INVALID' }, 'en').message
    ).toBe(getTeamCopy('en').inviteInvalidError);
    expect(
      toTeamClientError(410, { errorCode: 'INVITE_EXPIRED' }, 'en').message
    ).toBe(getTeamCopy('en').inviteExpiredError);
  });

  it('maps forbidden to generic access copy and 401 to re-auth', async () => {
    const forbidden = toTeamClientError(
      403,
      {
        error: 'Cross-workspace access denied',
        errorCode: 'TENANCY_FORBIDDEN',
      },
      'en'
    );
    expect(forbidden.message).toBe(getTeamCopy('en').forbiddenError);
    expect(forbidden.message).not.toContain('ws_other');
    const expired = toTeamClientError(
      401,
      { error: 'Session is expired.', errorCode: 'INVALID_SESSION' },
      'en'
    );
    expect(expired.needsReauth).toBe(true);
    expect(expired.message).toBe(getTeamCopy('en').expiredNotice);
  });

  it('thrown errors never echo emails, tokens, or passwords', async () => {
    const email = 'clerk@toko.id';
    const fetchFn = stubFetch(async () =>
      jsonResponse(
        { error: 'Invite is invalid.', errorCode: 'INVITE_INVALID' },
        404
      )
    );
    const err = await createInvite(
      'ws_1',
      { email, role: 'staff' },
      { fetchFn }
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TeamClientError);
    const message = (err as TeamClientError).message;
    expect(message).not.toContain(email);
    expect(JSON.stringify(err)).not.toMatch(/tokenHash|passwordHash/);
  });

  it('rejects Admin-with-scope client-side; empty scope normalizes to null', async () => {
    expect(validateScopeForRole('admin', 'wh_jkt_1')).toBe(false);
    expect(validateScopeForRole('admin', null)).toBe(true);
    expect(validateScopeForRole('manager', 'wh_jkt_1')).toBe(true);
    expect(normalizeScope('   ')).toBe(null);
    expect(normalizeScope('wh_jkt_1 ')).toBe('wh_jkt_1');
  });

  it('locks the last active Admin row: demote/deactivate controls bind disabled', async () => {
    const member = (
      userId: string,
      role: MemberView['role'],
      status: MemberView['status']
    ): MemberView => ({
      id: `m_${userId}`,
      workspaceId: 'ws_1',
      userId,
      role,
      warehouseScope: null,
      status,
      authVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const soleAdmin = [member('u_admin', 'admin', 'active')];
    const twoAdmins = [
      member('u_admin', 'admin', 'active'),
      member('u_admin2', 'admin', 'active'),
      member('u_staff', 'staff', 'active'),
    ];
    const demoted = [
      member('u_admin', 'admin', 'deactivated'),
      member('u_admin2', 'admin', 'active'),
    ];

    // Counts drive the banner + the row lock.
    expect(countActiveAdmins(soleAdmin)).toBe(1);
    expect(countActiveAdmins(twoAdmins)).toBe(2);
    expect(countActiveAdmins([])).toBe(0);

    // Sole active Admin: locked — the panel disables role/scope/save and
    // the deactivate button for this row (no submit possible).
    expect(isLastActiveAdmin(soleAdmin, 'u_admin')).toBe(true);

    // Two active Admins: either may be demoted/deactivated — not locked.
    expect(isLastActiveAdmin(twoAdmins, 'u_admin')).toBe(false);
    expect(isLastActiveAdmin(twoAdmins, 'u_admin2')).toBe(false);

    // Non-admins and deactivated rows are never locked…
    expect(isLastActiveAdmin(twoAdmins, 'u_staff')).toBe(false);
    expect(isLastActiveAdmin(demoted, 'u_admin')).toBe(false);
    // …and unknown ids lock nothing (stale-list safe).
    expect(isLastActiveAdmin(soleAdmin, 'u_ghost')).toBe(false);

    // The lock message is the dedicated last-Admin copy (never a raw 409).
    expect(
      toTeamClientError(409, { errorCode: 'TENANCY_LAST_ADMIN' }, 'en').message
    ).toBe(getTeamCopy('en').lastAdminError);
  });

  it('en/id copy stays in sync with no secret wording', () => {
    const en = getTeamCopy('en');
    const id = getTeamCopy('id');
    expect(Object.keys(id).sort()).toEqual(teamCopyKeys().sort());
    for (const key of teamCopyKeys()) {
      for (const text of [en[key], id[key]]) {
        expect(text).not.toMatch(/passwordHash|tokenHash|Bearer/);
      }
    }
  });
});
