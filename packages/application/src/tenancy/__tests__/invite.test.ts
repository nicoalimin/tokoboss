import { describe, expect, it } from 'vitest';
import {
  InMemoryInviteStore,
  InMemoryTenancyStore,
  InviteConflictError,
  InviteExpiredError,
  InviteInvalidError,
  LastAdminError,
  TenancyForbiddenError,
  TenancyValidationError,
  acceptInvite,
  adminContext,
  changeMember,
  createInvite,
  createWorkspace,
  deactivateMember,
  listMembers,
  revokeInvite,
} from '../index';
import {
  InMemoryCredentialStore,
  ScryptPasswordHasher,
  validatePassword,
} from '../../auth/index';
import { hashInviteToken } from '../index';

const hasher = new ScryptPasswordHasher({ N: 1024, r: 8, p: 1, keyLen: 16 });

interface Fixture {
  tenancy: InMemoryTenancyStore;
  invites: InMemoryInviteStore;
  credentials: InMemoryCredentialStore;
  workspaceId: string;
  adminId: string;
}

async function newFixture(): Promise<Fixture> {
  const tenancy = new InMemoryTenancyStore();
  const invites = new InMemoryInviteStore();
  const credentials = new InMemoryCredentialStore();
  const adminId = 'user_admin_1';
  const { workspaceId } = await createWorkspace(
    tenancy,
    tenancy,
    {
      name: 'Acme',
      slug: `acme-${Math.random().toString(36).slice(2, 8)}`,
      initialAdminUserId: adminId,
    },
    tenancy.audit
  );
  return { tenancy, invites, credentials, workspaceId, adminId };
}

const policy = { validate: validatePassword };

describe('create invite (Admin-only)', () => {
  it('creates a scoped Manager invite and audits it without PII/secrets', async () => {
    const f = await newFixture();
    const { invite, token } = await createInvite(
      f.invites,
      f.tenancy,
      {
        ctx: adminContext(f.workspaceId, f.adminId),
        workspaceId: f.workspaceId,
        email: '  New-Hire@Example.com ',
        role: 'manager',
        warehouseScope: 'wh_jkt_1',
      },
      f.tenancy.audit,
      f.credentials
    );
    expect(token.length).toBeGreaterThan(20);
    expect(invite).toMatchObject({
      workspaceId: f.workspaceId,
      email: 'new-hire@example.com',
      role: 'manager',
      warehouseScope: 'wh_jkt_1',
      status: 'pending',
    });

    // Only the hash is stored — the raw token never reaches the row.
    const stored = await f.invites.findByTokenHash(hashInviteToken(token));
    expect(stored?.id).toBe(invite.id);
    expect(stored?.tokenHash).not.toContain(token);
    expect(stored?.tokenHash).toHaveLength(64);

    const created = f.tenancy.auditEvents.find(
      (e) => e.action === 'invite.created'
    );
    expect(created).toMatchObject({ category: 'invite', actorId: f.adminId });
    const wire = JSON.stringify(created);
    expect(wire).not.toContain('new-hire@example.com');
    expect(wire).not.toContain(token);
    expect(wire).not.toMatch(/tokenHash|password/i);
  });

  it('rejects Admin-with-scope, unknown roles, and bad emails', async () => {
    const f = await newFixture();
    const ctx = adminContext(f.workspaceId, f.adminId);
    await expect(
      createInvite(f.invites, f.tenancy, {
        ctx,
        workspaceId: f.workspaceId,
        email: 'boss@example.com',
        role: 'admin',
        warehouseScope: 'wh_jkt_1',
      })
    ).rejects.toThrow(TenancyValidationError);
    await expect(
      createInvite(f.invites, f.tenancy, {
        ctx,
        workspaceId: f.workspaceId,
        email: 'x@example.com',
        role: 'viewer' as never,
      })
    ).rejects.toThrow(TenancyValidationError);
    await expect(
      createInvite(f.invites, f.tenancy, {
        ctx,
        workspaceId: f.workspaceId,
        email: 'not-an-email',
        role: 'staff',
      })
    ).rejects.toThrow(TenancyValidationError);
  });

  it('denies non-Admin and cross-workspace invite creation', async () => {
    const f = await newFixture();
    const staffCtx = {
      workspaceId: f.workspaceId,
      userId: 'user_staff_1',
      role: 'staff' as const,
      warehouseScope: null,
      status: 'active' as const,
      authVersion: 1,
    };
    await expect(
      createInvite(f.invites, f.tenancy, {
        ctx: staffCtx,
        workspaceId: f.workspaceId,
        email: 'a@example.com',
        role: 'staff',
      })
    ).rejects.toThrow(TenancyForbiddenError);

    const other = await createWorkspace(
      f.tenancy,
      f.tenancy,
      {
        name: 'Other',
        slug: `other-${Math.random().toString(36).slice(2, 8)}`,
        initialAdminUserId: 'user_admin_b',
      },
      f.tenancy.audit
    ).then((r) => r.workspaceId);
    await expect(
      createInvite(f.invites, f.tenancy, {
        ctx: adminContext(f.workspaceId, f.adminId),
        workspaceId: other,
        email: 'a@example.com',
        role: 'staff',
      })
    ).rejects.toThrow(TenancyForbiddenError);
  });

  it('rejects duplicate pending invites and already-active members', async () => {
    const f = await newFixture();
    const ctx = adminContext(f.workspaceId, f.adminId);
    await createInvite(
      f.invites,
      f.tenancy,
      {
        ctx,
        workspaceId: f.workspaceId,
        email: 'dup@example.com',
        role: 'staff',
      },
      f.tenancy.audit,
      f.credentials
    );
    await expect(
      createInvite(
        f.invites,
        f.tenancy,
        {
          ctx,
          workspaceId: f.workspaceId,
          email: 'dup@example.com',
          role: 'staff',
        },
        f.tenancy.audit,
        f.credentials
      )
    ).rejects.toThrow(InviteConflictError);

    // Email already holding an active membership conflicts too.
    await f.credentials.create({
      email: 'member@example.com',
      userId: 'user_member_1',
      passwordHash: await hasher.hash('sari-roti-88!'),
    });
    await f.tenancy.create({
      workspaceId: f.workspaceId,
      userId: 'user_member_1',
      role: 'staff',
      warehouseScope: null,
      status: 'active',
    });
    await expect(
      createInvite(
        f.invites,
        f.tenancy,
        {
          ctx,
          workspaceId: f.workspaceId,
          email: 'member@example.com',
          role: 'staff',
        },
        f.tenancy.audit,
        f.credentials
      )
    ).rejects.toThrow(InviteConflictError);
  });
});

describe('accept invite (token-gated)', () => {
  it('creates a membership, marks the ticket accepted, and audits cleanly', async () => {
    const f = await newFixture();
    const { token } = await createInvite(
      f.invites,
      f.tenancy,
      {
        ctx: adminContext(f.workspaceId, f.adminId),
        workspaceId: f.workspaceId,
        email: 'hire@example.com',
        role: 'staff',
      },
      f.tenancy.audit,
      f.credentials
    );
    const result = await acceptInvite(
      { invites: f.invites, members: f.tenancy, audit: f.tenancy.audit },
      { token }
    );
    expect(result.isNewMember).toBe(true);
    expect(result.membership).toMatchObject({
      workspaceId: f.workspaceId,
      role: 'staff',
      status: 'active',
      authVersion: 1,
    });
    const stored = await f.invites.listByWorkspace(f.workspaceId);
    expect(stored[0]?.status).toBe('accepted');

    const actions = f.tenancy.auditEvents.map((e) => e.action);
    expect(actions).toContain('invite.accepted');
    expect(actions).toContain('membership.added');
    const wire = JSON.stringify(f.tenancy.auditEvents);
    expect(wire).not.toContain('hire@example.com');
    expect(wire).not.toContain(token);
  });

  it('provisions a credential when a password is supplied', async () => {
    const f = await newFixture();
    const { token } = await createInvite(
      f.invites,
      f.tenancy,
      {
        ctx: adminContext(f.workspaceId, f.adminId),
        workspaceId: f.workspaceId,
        email: 'login@example.com',
        role: 'manager',
        warehouseScope: 'wh_jkt_1',
      },
      f.tenancy.audit,
      f.credentials
    );
    const result = await acceptInvite(
      {
        invites: f.invites,
        members: f.tenancy,
        audit: f.tenancy.audit,
        credentials: f.credentials,
        hasher,
        passwordPolicy: policy,
      },
      { token, userId: 'user_login_1', password: 'fresh-noodles-42' }
    );
    expect(result.isNewUser).toBe(true);
    expect(result.userId).toBe('user_login_1');
    const credential = await f.credentials.findByEmail('login@example.com');
    expect(credential?.userId).toBe('user_login_1');
    expect(credential?.passwordHash).not.toContain('fresh-noodles-42');
    expect(
      await hasher.verify(credential!.passwordHash, 'fresh-noodles-42')
    ).toBe(true);
  });

  it('binds to the existing credential and rejects userId mismatch', async () => {
    const f = await newFixture();
    await f.credentials.create({
      email: 'known@example.com',
      userId: 'user_known_1',
      passwordHash: await hasher.hash('sari-roti-88!'),
    });
    const { token } = await createInvite(
      f.invites,
      f.tenancy,
      {
        ctx: adminContext(f.workspaceId, f.adminId),
        workspaceId: f.workspaceId,
        email: 'known@example.com',
        role: 'staff',
      },
      f.tenancy.audit,
      f.credentials
    );
    const ok = await acceptInvite(
      {
        invites: f.invites,
        members: f.tenancy,
        audit: f.tenancy.audit,
        credentials: f.credentials,
      },
      { token, userId: 'user_known_1' }
    );
    expect(ok.userId).toBe('user_known_1');
    expect(ok.isNewUser).toBe(false);

    const { token: token2 } = await createInvite(
      f.invites,
      f.tenancy,
      {
        ctx: adminContext(f.workspaceId, f.adminId),
        workspaceId: f.workspaceId,
        email: 'known@example.com',
        role: 'staff',
      },
      f.tenancy.audit
      // Skip the active-membership conflict check: the first accept already
      // created the membership, so omit credentials to mint a second ticket.
    );
    await expect(
      acceptInvite(
        {
          invites: f.invites,
          members: f.tenancy,
          audit: f.tenancy.audit,
          credentials: f.credentials,
        },
        { token: token2, userId: 'user_impostor_9' }
      )
    ).rejects.toThrow(TenancyValidationError);
  });

  it('is idempotent for already-active memberships', async () => {
    const f = await newFixture();
    const { token } = await createInvite(
      f.invites,
      f.tenancy,
      {
        ctx: adminContext(f.workspaceId, f.adminId),
        workspaceId: f.workspaceId,
        email: 'again@example.com',
        role: 'staff',
      },
      f.tenancy.audit,
      f.credentials
    );
    const first = await acceptInvite(
      { invites: f.invites, members: f.tenancy, audit: f.tenancy.audit },
      { token, userId: 'user_again_1' }
    );
    // Second ticket for the same email (membership now active): accept
    // resolves to the existing membership instead of duplicating it.
    const secondTicket = await createInvite(
      f.invites,
      f.tenancy,
      {
        ctx: adminContext(f.workspaceId, f.adminId),
        workspaceId: f.workspaceId,
        email: 'again@example.com',
        role: 'staff',
      },
      f.tenancy.audit
    );
    const second = await acceptInvite(
      { invites: f.invites, members: f.tenancy, audit: f.tenancy.audit },
      { token: secondTicket.token, userId: first.userId }
    );
    expect(second.isNewMember).toBe(false);
    expect(second.membership.id).toBe(first.membership.id);
  });

  it('reactivates deactivated memberships onto the ticket role/scope', async () => {
    const f = await newFixture();
    const ctx = adminContext(f.workspaceId, f.adminId);
    const { token } = await createInvite(
      f.invites,
      f.tenancy,
      {
        ctx,
        workspaceId: f.workspaceId,
        email: 'back@example.com',
        role: 'staff',
      },
      f.tenancy.audit,
      f.credentials
    );
    const first = await acceptInvite(
      { invites: f.invites, members: f.tenancy, audit: f.tenancy.audit },
      { token, userId: 'user_back_1' }
    );
    await deactivateMember(
      f.tenancy,
      { ctx, workspaceId: f.workspaceId, targetUserId: first.userId },
      f.tenancy.audit
    );
    const { token: rehire } = await createInvite(
      f.invites,
      f.tenancy,
      {
        ctx,
        workspaceId: f.workspaceId,
        email: 'back@example.com',
        role: 'manager',
        warehouseScope: 'wh_sby_2',
      },
      f.tenancy.audit
    );
    const renewed = await acceptInvite(
      { invites: f.invites, members: f.tenancy, audit: f.tenancy.audit },
      { token: rehire, userId: first.userId }
    );
    expect(renewed.isNewMember).toBe(true);
    expect(renewed.membership).toMatchObject({
      role: 'manager',
      warehouseScope: 'wh_sby_2',
      status: 'active',
      authVersion: 3,
    });
  });

  it('rejects unknown/consumed tokens and stamps expired tickets', async () => {
    const f = await newFixture();
    await expect(
      acceptInvite(
        { invites: f.invites, members: f.tenancy },
        { token: 'no-such-ticket' }
      )
    ).rejects.toThrow(InviteInvalidError);
    await expect(
      acceptInvite({ invites: f.invites, members: f.tenancy }, { token: '' })
    ).rejects.toThrow(InviteInvalidError);

    const { token } = await createInvite(
      f.invites,
      f.tenancy,
      {
        ctx: adminContext(f.workspaceId, f.adminId),
        workspaceId: f.workspaceId,
        email: 'stale@example.com',
        role: 'staff',
        ttlMs: 1,
      },
      f.tenancy.audit,
      f.credentials
    );
    await expect(
      acceptInvite(
        { invites: f.invites, members: f.tenancy, audit: f.tenancy.audit },
        { token, now: new Date(Date.now() + 60_000) }
      )
    ).rejects.toThrow(InviteExpiredError);
    const rows = await f.invites.listByWorkspace(f.workspaceId);
    expect(rows[0]?.status).toBe('expired');
    expect(f.tenancy.auditEvents.map((e) => e.action)).toContain(
      'invite.expired'
    );
    // A retried expired ticket stays expired (never retried into validity).
    await expect(
      acceptInvite(
        { invites: f.invites, members: f.tenancy, audit: f.tenancy.audit },
        { token }
      )
    ).rejects.toThrow(InviteExpiredError);

    // Reusing a consumed ticket is invalid, not expired.
    const fresh = await createInvite(
      f.invites,
      f.tenancy,
      {
        ctx: adminContext(f.workspaceId, f.adminId),
        workspaceId: f.workspaceId,
        email: 'once@example.com',
        role: 'staff',
      },
      f.tenancy.audit,
      f.credentials
    );
    await acceptInvite(
      { invites: f.invites, members: f.tenancy, audit: f.tenancy.audit },
      { token: fresh.token }
    );
    await expect(
      acceptInvite(
        { invites: f.invites, members: f.tenancy, audit: f.tenancy.audit },
        { token: fresh.token }
      )
    ).rejects.toThrow(InviteInvalidError);
  });
});

describe('revoke invite', () => {
  it('revokes pending tickets; consumed tickets and non-Admins are denied', async () => {
    const f = await newFixture();
    const ctx = adminContext(f.workspaceId, f.adminId);
    const { invite } = await createInvite(
      f.invites,
      f.tenancy,
      {
        ctx,
        workspaceId: f.workspaceId,
        email: 'gone@example.com',
        role: 'staff',
      },
      f.tenancy.audit,
      f.credentials
    );
    await revokeInvite(
      f.invites,
      { ctx, workspaceId: f.workspaceId, inviteId: invite.id },
      f.tenancy.audit
    );
    expect((await f.invites.listByWorkspace(f.workspaceId))[0]?.status).toBe(
      'revoked'
    );
    expect(f.tenancy.auditEvents.map((e) => e.action)).toContain(
      'invite.revoked'
    );
    await expect(
      revokeInvite(f.invites, {
        ctx,
        workspaceId: f.workspaceId,
        inviteId: invite.id,
      })
    ).rejects.toThrow(InviteInvalidError);

    const staffCtx = {
      workspaceId: f.workspaceId,
      userId: 'user_staff_1',
      role: 'staff' as const,
      warehouseScope: null,
      status: 'active' as const,
      authVersion: 1,
    };
    await expect(
      revokeInvite(f.invites, {
        ctx: staffCtx,
        workspaceId: f.workspaceId,
        inviteId: invite.id,
      })
    ).rejects.toThrow(TenancyForbiddenError);
  });
});

describe('list / update / deactivate members', () => {
  it('lists members Admin-only with cross-workspace deny', async () => {
    const f = await newFixture();
    const ctx = adminContext(f.workspaceId, f.adminId);
    const listed = await listMembers(f.tenancy, {
      ctx,
      workspaceId: f.workspaceId,
    });
    expect(listed).toHaveLength(1);

    const staffCtx = {
      workspaceId: f.workspaceId,
      userId: 'user_staff_1',
      role: 'staff' as const,
      warehouseScope: null,
      status: 'active' as const,
      authVersion: 1,
    };
    await expect(
      listMembers(f.tenancy, { ctx: staffCtx, workspaceId: f.workspaceId })
    ).rejects.toThrow(TenancyForbiddenError);
    await expect(
      listMembers(f.tenancy, { ctx, workspaceId: 'ws_other_0000' })
    ).rejects.toThrow(TenancyForbiddenError);
  });

  it('updates role/scope with auth_version bump; last-Admin demote denied', async () => {
    const f = await newFixture();
    const ctx = adminContext(f.workspaceId, f.adminId);
    const { token } = await createInvite(
      f.invites,
      f.tenancy,
      {
        ctx,
        workspaceId: f.workspaceId,
        email: 'clerk@example.com',
        role: 'staff',
      },
      f.tenancy.audit,
      f.credentials
    );
    const accepted = await acceptInvite(
      { invites: f.invites, members: f.tenancy, audit: f.tenancy.audit },
      { token }
    );
    const updated = await changeMember(
      f.tenancy,
      {
        ctx,
        workspaceId: f.workspaceId,
        targetUserId: accepted.userId,
        role: 'manager',
        warehouseScope: 'wh_jkt_1',
      },
      f.tenancy.audit
    );
    expect(updated).toMatchObject({
      role: 'manager',
      warehouseScope: 'wh_jkt_1',
      authVersion: 2,
    });
    await expect(
      changeMember(f.tenancy, {
        ctx,
        workspaceId: f.workspaceId,
        targetUserId: f.adminId,
        role: 'staff',
      })
    ).rejects.toThrow(LastAdminError);
  });

  it('deactivates with session revoke + forced_sign_out; last-Admin denied', async () => {
    const f = await newFixture();
    const ctx = adminContext(f.workspaceId, f.adminId);
    const { token } = await createInvite(
      f.invites,
      f.tenancy,
      {
        ctx,
        workspaceId: f.workspaceId,
        email: 'leaver@example.com',
        role: 'staff',
      },
      f.tenancy.audit,
      f.credentials
    );
    const accepted = await acceptInvite(
      { invites: f.invites, members: f.tenancy, audit: f.tenancy.audit },
      { token }
    );
    const revoked: string[] = [];
    const updated = await deactivateMember(
      f.tenancy,
      { ctx, workspaceId: f.workspaceId, targetUserId: accepted.userId },
      f.tenancy.audit,
      {
        revokeAllByUser: async (userId: string) => {
          revoked.push(userId);
          return 3;
        },
      }
    );
    expect(updated.status).toBe('deactivated');
    expect(updated.authVersion).toBe(2);
    expect(revoked).toEqual([accepted.userId]);
    const forced = f.tenancy.auditEvents.filter(
      (e) => e.action === 'security.forced_sign_out'
    );
    expect(forced).toHaveLength(1);
    expect(forced[0]).toMatchObject({
      category: 'security',
      payload: {
        workspaceId: f.workspaceId,
        userId: accepted.userId,
        reason: 'admin_deactivate',
      },
    });

    await expect(
      deactivateMember(f.tenancy, {
        ctx,
        workspaceId: f.workspaceId,
        targetUserId: f.adminId,
      })
    ).rejects.toThrow(LastAdminError);
  });
});
