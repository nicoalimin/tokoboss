import { describe, expect, it } from 'vitest';
import {
  InMemoryTenancyStore,
  LastAdminError,
  TenancyForbiddenError,
  TenancyValidationError,
  addMember,
  adminContext,
  assertSameWorkspace,
  assertWarehouseAccess,
  changeMember,
  createWorkspace,
  emitSecurityEvent,
  forceSignOut,
  removeMember,
  resolveWorkspaceContext,
} from '../index';

async function newWorkspaceWithAdmin(
  store: InMemoryTenancyStore,
  adminUserId = 'user_admin_1'
) {
  const { workspaceId } = await createWorkspace(
    store,
    store,
    {
      name: 'Acme',
      slug: `acme-${Math.random().toString(36).slice(2, 8)}`,
      initialAdminUserId: adminUserId,
    },
    store.audit
  );
  return workspaceId;
}

describe('workspace tenancy model (Admin/Manager/Staff + warehouse scope)', () => {
  it('creates a workspace with one active Admin and audits it', async () => {
    const store = new InMemoryTenancyStore();
    const ws = await newWorkspaceWithAdmin(store);
    const members = await store.listByWorkspace(ws);
    expect(members).toHaveLength(1);
    expect(members[0]?.role).toBe('admin');
    expect(members[0]?.status).toBe('active');
    expect(members[0]?.authVersion).toBe(1);
    expect(store.auditEvents.map((e) => e.action)).toContain(
      'workspace.created'
    );
  });

  it('rejects Admin with a warehouse scope and unknown roles', async () => {
    const store = new InMemoryTenancyStore();
    const ws = await newWorkspaceWithAdmin(store);
    const ctx = adminContext(ws, 'user_admin_1');
    await expect(
      addMember(store, {
        ctx,
        workspaceId: ws,
        userId: 'user_m_1',
        role: 'admin',
        warehouseScope: 'wh_jakarta',
      })
    ).rejects.toThrow(TenancyValidationError);
    await expect(
      addMember(store, {
        ctx,
        workspaceId: ws,
        userId: 'user_x_1',
        role: 'viewer' as unknown as import('../tenancy-types').WorkspaceRole,
      })
    ).rejects.toThrow(TenancyValidationError);
  });

  it('allows scoped Manager/Staff and gates warehouse access', async () => {
    const store = new InMemoryTenancyStore();
    const ws = await newWorkspaceWithAdmin(store);
    const ctx = adminContext(ws, 'user_admin_1');
    await addMember(
      store,
      {
        ctx,
        workspaceId: ws,
        userId: 'user_mgr_1',
        role: 'manager',
        warehouseScope: 'wh_jkt_1',
      },
      store.audit
    );
    const member = await store.findByWorkspaceAndUser(ws, 'user_mgr_1');
    expect(member?.warehouseScope).toBe('wh_jkt_1');
    const mgrCtx = {
      workspaceId: ws,
      userId: 'user_mgr_1',
      role: 'manager' as const,
      warehouseScope: 'wh_jkt_1',
      status: 'active' as const,
      authVersion: 1,
    };
    expect(() => assertWarehouseAccess(mgrCtx, 'wh_jkt_1')).not.toThrow();
    expect(() => assertWarehouseAccess(mgrCtx, 'wh_sby_9')).toThrow(
      TenancyForbiddenError
    );
    // Admin bypasses warehouse gates.
    expect(() => assertWarehouseAccess(ctx, 'wh_sby_9')).not.toThrow();
  });
});

describe('cross-workspace deny at the application boundary', () => {
  it('resolves null for non-members and denies reads/writes', async () => {
    const store = new InMemoryTenancyStore();
    const wsA = await newWorkspaceWithAdmin(store, 'user_admin_a');
    const wsB = await createWorkspace(
      store,
      store,
      {
        name: 'Other',
        slug: `other-${Math.random().toString(36).slice(2, 8)}`,
        initialAdminUserId: 'user_admin_b',
      },
      store.audit
    ).then((r) => r.workspaceId);

    // Server-side resolution: user_admin_a has no membership in wsB.
    const ctxInB = await resolveWorkspaceContext(store, {
      requestedWorkspaceId: wsB,
      userId: 'user_admin_a',
    });
    expect(ctxInB).toBeNull();
    expect(() => assertSameWorkspace(ctxInB, wsB)).toThrow(
      TenancyForbiddenError
    );

    // Even with a valid ctx for wsA, targeting wsB is denied.
    const ctxA = await resolveWorkspaceContext(store, {
      requestedWorkspaceId: wsA,
      userId: 'user_admin_a',
    });
    expect(ctxA).not.toBeNull();
    expect(() => assertSameWorkspace(ctxA, wsB)).toThrow(TenancyForbiddenError);

    // Member mutations across workspaces are denied (never leaked).
    await expect(
      addMember(store, {
        ctx: ctxA!,
        workspaceId: wsB,
        userId: 'user_evil',
        role: 'staff',
      })
    ).rejects.toThrow(TenancyForbiddenError);
  });

  it('non-Admin members cannot mutate membership', async () => {
    const store = new InMemoryTenancyStore();
    const ws = await newWorkspaceWithAdmin(store);
    const admin = adminContext(ws, 'user_admin_1');
    await addMember(
      store,
      { ctx: admin, workspaceId: ws, userId: 'user_staff_1', role: 'staff' },
      store.audit
    );
    const staffCtx = {
      workspaceId: ws,
      userId: 'user_staff_1',
      role: 'staff' as const,
      warehouseScope: null,
      status: 'active' as const,
      authVersion: 1,
    };
    await expect(
      addMember(store, {
        ctx: staffCtx,
        workspaceId: ws,
        userId: 'user_staff_2',
        role: 'staff',
      })
    ).rejects.toThrow(TenancyForbiddenError);
  });
});

describe('final-active-Admin invariant', () => {
  it('cannot deactivate the last active Admin', async () => {
    const store = new InMemoryTenancyStore();
    const ws = await newWorkspaceWithAdmin(store);
    const ctx = adminContext(ws, 'user_admin_1');
    await expect(
      changeMember(store, {
        ctx,
        workspaceId: ws,
        targetUserId: 'user_admin_1',
        status: 'deactivated',
      })
    ).rejects.toThrow(LastAdminError);
  });

  it('cannot demote or remove the last active Admin', async () => {
    const store = new InMemoryTenancyStore();
    const ws = await newWorkspaceWithAdmin(store);
    const ctx = adminContext(ws, 'user_admin_1');
    await expect(
      changeMember(store, {
        ctx,
        workspaceId: ws,
        targetUserId: 'user_admin_1',
        role: 'manager',
      })
    ).rejects.toThrow(LastAdminError);
    await expect(
      removeMember(store, {
        ctx,
        workspaceId: ws,
        targetUserId: 'user_admin_1',
      })
    ).rejects.toThrow(LastAdminError);
  });

  it('allows rotation once a second active Admin exists', async () => {
    const store = new InMemoryTenancyStore();
    const ws = await newWorkspaceWithAdmin(store);
    const ctx = adminContext(ws, 'user_admin_1');
    await addMember(
      store,
      { ctx, workspaceId: ws, userId: 'user_admin_2', role: 'admin' },
      store.audit
    );
    const demoted = await changeMember(
      store,
      { ctx, workspaceId: ws, targetUserId: 'user_admin_1', role: 'staff' },
      store.audit
    );
    expect(demoted.role).toBe('staff');
    expect(demoted.authVersion).toBe(2);
  });
});

describe('auth-version bump on role/scope/status change', () => {
  it('bumps auth_version on role change and emits audited role event', async () => {
    const store = new InMemoryTenancyStore();
    const ws = await newWorkspaceWithAdmin(store);
    const ctx = adminContext(ws, 'user_admin_1');
    await addMember(
      store,
      { ctx, workspaceId: ws, userId: 'user_staff_1', role: 'staff' },
      store.audit
    );
    const updated = await changeMember(
      store,
      { ctx, workspaceId: ws, targetUserId: 'user_staff_1', role: 'manager' },
      store.audit
    );
    expect(updated.authVersion).toBe(2);
    const actions = store.auditEvents.map((e) => e.action);
    expect(actions).toContain('membership.role_changed');
  });

  it('bumps auth_version on forced sign-out (revoke-all hook)', async () => {
    const store = new InMemoryTenancyStore();
    const ws = await newWorkspaceWithAdmin(store);
    const ctx = adminContext(ws, 'user_admin_1');
    await addMember(
      store,
      { ctx, workspaceId: ws, userId: 'user_staff_9', role: 'staff' },
      store.audit
    );
    const before = await store.findByWorkspaceAndUser(ws, 'user_staff_9');
    const after = await forceSignOut(
      store,
      {
        ctx,
        workspaceId: ws,
        targetUserId: 'user_staff_9',
        reason: 'password_reset',
      },
      store.audit
    );
    expect(after.authVersion).toBe((before?.authVersion ?? 1) + 1);
    expect(store.auditEvents.map((e) => e.action)).toContain(
      'security.forced_sign_out'
    );
  });
});

describe('audit baseline without secrets/PII', () => {
  it('writes membership audit rows with opaque ids only', async () => {
    const store = new InMemoryTenancyStore();
    const ws = await newWorkspaceWithAdmin(store);
    const ctx = adminContext(ws, 'user_admin_1');
    await addMember(
      store,
      { ctx, workspaceId: ws, userId: 'user_staff_7', role: 'staff' },
      store.audit
    );
    const added = store.auditEvents.find(
      (e) => e.action === 'membership.added'
    );
    expect(added).toBeDefined();
    expect(added?.category).toBe('membership');
    const serialized = JSON.stringify(added);
    expect(serialized).not.toMatch(/@example\.com/);
    expect(serialized).not.toMatch(/password|Bearer/i);
  });

  it('rejects audit payloads carrying secrets/PII', async () => {
    const store = new InMemoryTenancyStore();
    const ws = await newWorkspaceWithAdmin(store);
    await expect(
      emitSecurityEvent(store.audit, {
        workspaceId: ws,
        action: 'security.sign_in_succeeded',
        payload: { email: 'buyer@example.com' },
      })
    ).rejects.toThrow(TenancyValidationError);
    await expect(
      emitSecurityEvent(store.audit, {
        workspaceId: ws,
        action: 'security.password_reset',
        payload: { password: 'new-secret' },
      })
    ).rejects.toThrow(TenancyValidationError);
  });

  it('emits the four MVP security event hooks', async () => {
    const store = new InMemoryTenancyStore();
    const ws = await newWorkspaceWithAdmin(store);
    const actions = [
      'security.sign_in_succeeded',
      'security.sign_in_failed',
      'security.password_reset',
      'security.forced_sign_out',
    ] as const;
    for (const action of actions) {
      await emitSecurityEvent(store.audit, {
        workspaceId: ws,
        action,
        actorId: 'user_admin_1',
        payload: { workspaceId: ws, reason: 'test-hook' },
      });
    }
    for (const action of actions) {
      expect(store.auditEvents.map((e) => e.action)).toContain(action);
    }
    expect(
      store.auditEvents
        .filter((e) => e.action.startsWith('security.'))
        .every((e) => e.category === 'security')
    ).toBe(true);
  });
});
