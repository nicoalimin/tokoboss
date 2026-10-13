import { describe, expect, it } from 'vitest';
import { InMemoryTenancyStore } from '../in-memory-tenancy-store';
import { accessWorkspace } from '../workspace-access';

describe('accessWorkspace (US29 / RFC 02 rows 23–24)', () => {
  it('grants active membership; throttles touch; switch always touches + audits', async () => {
    const store = new InMemoryTenancyStore();
    const ws = await store.createWorkspace({ name: 'Acme', slug: 'acme' });
    const other = await store.createWorkspace({ name: 'Beta', slug: 'beta' });
    await store.create({
      workspaceId: ws.id,
      userId: 'user_ok',
      role: 'admin',
      warehouseScope: null,
      status: 'active',
    });
    const logs: Record<string, unknown>[] = [];
    const deps = {
      members: store,
      audit: store.audit,
      log: (line: Record<string, unknown>) => logs.push(line),
    };

    const t0 = new Date('2026-10-13T02:00:00Z');
    const ok = await accessWorkspace(
      deps,
      { workspaceId: ws.id, userId: 'user_ok', sessionId: 'sess_1' },
      t0
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.membership.workspaceId).toBe(ws.id);
      expect(ok.membership.userId).toBe('user_ok');
    }
    const afterFirst = await store.listAccessibleByUser('user_ok');
    expect(afterFirst[0]?.lastActiveAt?.toISOString()).toBe(t0.toISOString());
    expect(store.auditEvents).toHaveLength(0);

    // Within 60s throttle and no switch → no second touch, no audit.
    const t1 = new Date('2026-10-13T02:00:30Z');
    const again = await accessWorkspace(
      deps,
      { workspaceId: ws.id, userId: 'user_ok', sessionId: 'sess_1' },
      t1
    );
    expect(again.ok).toBe(true);
    const afterThrottle = await store.listAccessibleByUser('user_ok');
    expect(afterThrottle[0]?.lastActiveAt?.toISOString()).toBe(
      t0.toISOString()
    );
    expect(store.auditEvents).toHaveLength(0);

    // Switch always writes touch + security.workspace_switched.
    const t2 = new Date('2026-10-13T02:00:45Z');
    const switched = await accessWorkspace(
      deps,
      {
        workspaceId: ws.id,
        userId: 'user_ok',
        sessionId: 'sess_1',
        switching: { fromWorkspaceId: other.id },
        correlationId: 'corr_sw',
      },
      t2
    );
    expect(switched.ok).toBe(true);
    const afterSwitch = await store.listAccessibleByUser('user_ok');
    expect(afterSwitch[0]?.lastActiveAt?.toISOString()).toBe(t2.toISOString());
    expect(store.auditEvents).toHaveLength(1);
    expect(store.auditEvents[0]).toMatchObject({
      workspaceId: ws.id,
      action: 'security.workspace_switched',
      category: 'security',
      actorType: 'user',
      actorId: 'user_ok',
      correlationId: 'corr_sw',
      payload: {
        fromWorkspaceId: other.id,
        toWorkspaceId: ws.id,
        sessionId: 'sess_1',
      },
    });
    expect(logs).toHaveLength(0);
  });

  it('unknown and malformed ids → neutral + log only (no audit, no store hit)', async () => {
    const store = new InMemoryTenancyStore();
    const logs: Record<string, unknown>[] = [];
    const deps = {
      members: store,
      audit: store.audit,
      log: (line: Record<string, unknown>) => logs.push(line),
    };

    for (const workspaceId of [
      'ws_missing',
      '',
      '   ',
      'bad id!',
      'x'.repeat(65),
    ]) {
      const res = await accessWorkspace(deps, {
        workspaceId,
        userId: 'user_any',
        sessionId: 'sess_u',
      });
      expect(res).toEqual({ ok: false });
    }
    expect(logs).toEqual([
      { event: 'workspace_access.unknown', sessionId: 'sess_u' },
      { event: 'workspace_access.unknown', sessionId: 'sess_u' },
      { event: 'workspace_access.unknown', sessionId: 'sess_u' },
      { event: 'workspace_access.unknown', sessionId: 'sess_u' },
      { event: 'workspace_access.unknown', sessionId: 'sess_u' },
    ]);
    expect(store.auditEvents).toHaveLength(0);
  });

  it('deactivated membership or workspace → same neutral + denied audit with reason', async () => {
    const store = new InMemoryTenancyStore();
    const wsMem = await store.createWorkspace({
      name: 'Mem Off',
      slug: 'mem-off',
    });
    const wsWs = await store.createWorkspace({
      name: 'Ws Off',
      slug: 'ws-off',
    });
    await store.create({
      workspaceId: wsMem.id,
      userId: 'user_deny',
      role: 'staff',
      warehouseScope: null,
      status: 'deactivated',
    });
    await store.create({
      workspaceId: wsWs.id,
      userId: 'user_deny',
      role: 'staff',
      warehouseScope: null,
      status: 'active',
    });
    store.deactivatedWorkspaceIds.add(wsWs.id);
    const deps = { members: store, audit: store.audit };

    const r1 = await accessWorkspace(deps, {
      workspaceId: wsMem.id,
      userId: 'user_deny',
      sessionId: 'sess_d1',
    });
    expect(r1).toEqual({ ok: false });
    expect(store.auditEvents[0]).toMatchObject({
      workspaceId: wsMem.id,
      action: 'security.workspace_access_denied',
      category: 'security',
      actorId: 'user_deny',
      payload: { sessionId: 'sess_d1', reason: 'membership_deactivated' },
    });

    const r2 = await accessWorkspace(deps, {
      workspaceId: wsWs.id,
      userId: 'user_deny',
      sessionId: 'sess_d2',
    });
    expect(r2).toEqual({ ok: false });
    expect(store.auditEvents[1]).toMatchObject({
      workspaceId: wsWs.id,
      action: 'security.workspace_access_denied',
      category: 'security',
      actorId: 'user_deny',
      payload: { sessionId: 'sess_d2', reason: 'workspace_deactivated' },
    });
    expect(store.auditEvents).toHaveLength(2);
    // no touch on denied paths
    const accessible = await store.listAccessibleByUser('user_deny');
    expect(accessible).toHaveLength(0);
  });
});
