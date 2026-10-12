import { describe, expect, it } from 'vitest';
import { InMemoryTenancyStore } from '../in-memory-tenancy-store';
import { TenancyValidationError } from '../tenancy-errors';
import {
  listAccessibleWorkspaces,
  resolveWorkspaceLanding,
  warehouseScopeLabel,
  workspaceInitials,
} from '../workspace-landing';

describe('workspace-landing (US29 / RFC 02 row 14–15)', () => {
  it('resolveWorkspaceLanding: 0→picker, 1→workspace, many+top stamped→top, many all-null→picker', async () => {
    const store = new InMemoryTenancyStore();
    await expect(resolveWorkspaceLanding(store, '')).rejects.toThrow(
      TenancyValidationError
    );
    await expect(resolveWorkspaceLanding(store, '   ')).rejects.toThrow(
      TenancyValidationError
    );

    expect(await resolveWorkspaceLanding(store, 'user_none')).toEqual({
      kind: 'picker',
    });

    const only = await store.createWorkspace({
      name: 'Satu Toko',
      slug: 'satu-toko',
    });
    await store.create({
      workspaceId: only.id,
      userId: 'user_one',
      role: 'admin',
      warehouseScope: null,
      status: 'active',
    });
    expect(await resolveWorkspaceLanding(store, 'user_one')).toEqual({
      kind: 'workspace',
      workspaceId: only.id,
    });

    const a = await store.createWorkspace({ name: 'Alpha', slug: 'alpha' });
    const b = await store.createWorkspace({ name: 'Beta', slug: 'beta' });
    await store.create({
      workspaceId: a.id,
      userId: 'user_many',
      role: 'admin',
      warehouseScope: null,
      status: 'active',
    });
    await store.create({
      workspaceId: b.id,
      userId: 'user_many',
      role: 'manager',
      warehouseScope: 'wh_jkt',
      status: 'active',
    });
    // both lastActiveAt null → picker
    expect(await resolveWorkspaceLanding(store, 'user_many')).toEqual({
      kind: 'picker',
    });
    // stamp Beta more recent → open Beta
    await store.touchLastActive(
      b.id,
      'user_many',
      new Date('2026-10-12T10:00:00Z')
    );
    await store.touchLastActive(
      a.id,
      'user_many',
      new Date('2026-10-11T10:00:00Z')
    );
    expect(await resolveWorkspaceLanding(store, 'user_many')).toEqual({
      kind: 'workspace',
      workspaceId: b.id,
    });
  });

  it('listAccessibleWorkspaces joins name/initials/scope; skips missing workspace rows', async () => {
    const store = new InMemoryTenancyStore();
    await expect(listAccessibleWorkspaces(store, store, '')).rejects.toThrow(
      TenancyValidationError
    );

    const ws = await store.createWorkspace({
      name: 'Toko Bersama',
      slug: 'toko-bersama',
    });
    const orphanId = 'ws_orphan_missing';
    await store.create({
      workspaceId: ws.id,
      userId: 'user_list',
      role: 'staff',
      warehouseScope: null,
      status: 'active',
    });
    // Membership pointing at a workspace the store no longer has (edge).
    await store.create({
      workspaceId: orphanId,
      userId: 'user_list',
      role: 'manager',
      warehouseScope: 'wh_sby',
      status: 'active',
    });
    // Remove orphan workspace row only — membership remains.
    (
      store as unknown as { workspaces: Map<string, unknown> }
    ).workspaces.delete(orphanId);

    const items = await listAccessibleWorkspaces(store, store, 'user_list');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      workspaceId: ws.id,
      name: 'Toko Bersama',
      initials: 'TB',
      role: 'staff',
      warehouseScopeLabel: 'Semua gudang',
      lastActiveAt: null,
    });
  });

  it('workspaceInitials and warehouseScopeLabel helpers', () => {
    expect(workspaceInitials('')).toBe('?');
    expect(workspaceInitials('   ')).toBe('?');
    expect(workspaceInitials('Acme')).toBe('AC');
    expect(workspaceInitials('Toko Bersama Jaya')).toBe('TJ');
    expect(warehouseScopeLabel(null)).toBe('Semua gudang');
    expect(warehouseScopeLabel('')).toBe('Semua gudang');
    expect(warehouseScopeLabel('  ')).toBe('Semua gudang');
    expect(warehouseScopeLabel('wh_jkt')).toBe('wh_jkt');
    expect(warehouseScopeLabel('  wh_sby  ')).toBe('wh_sby');
  });
});
