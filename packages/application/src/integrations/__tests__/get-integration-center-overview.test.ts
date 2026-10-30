import { describe, expect, it } from 'vitest';
import type {
  WorkspaceContext,
  WorkspaceRole,
} from '../../tenancy/tenancy-types';
import {
  getIntegrationCenterOverview,
  type GetIntegrationCenterOverviewDeps,
} from '../get-integration-center-overview';
import { InMemoryConnectionStore } from '../in-memory-connection-store';
import {
  InMemoryIntegrationActivityReads,
  InMemoryIntegrationMetricsReads,
} from '../in-memory-integration-management-reads';

/** Integration Center overview (UTA-38 / US18, RFC 07 addendum row 44c). */
const NOW = new Date('2026-10-30T03:00:00.000Z');
const WS = 'ws_overview_1';

const member = (
  role: WorkspaceRole,
  overrides: Partial<WorkspaceContext> = {}
): WorkspaceContext => ({
  workspaceId: WS,
  userId: `user-${role}`,
  role,
  warehouseScope: null,
  status: 'active',
  authVersion: 1,
  ...overrides,
});

async function setup() {
  const connections = new InMemoryConnectionStore();
  const connect = (providerStoreId: string, storeName: string) =>
    connections.upsert({
      workspaceId: WS,
      provider: 'shopee',
      connectMode: 'oauth_redirect',
      shop: {
        providerStoreId,
        providerAccountId: null,
        shopCipher: null,
        storeName,
        region: 'ID',
      },
      grantedScopes: ['product', 'order'],
      accessTokenExpiresAt: null,
      authExpiresAt: null,
      connectedBy: 'user-admin',
      connectedAt: NOW,
    });
  const healthy = await connect('SHP-1', 'Toko Sehat');
  const paused = await connect('SHP-2', 'Toko Jeda');
  const reauth = await connect('SHP-3', 'Toko Reauth');
  const removed = await connect('SHP-4', 'Toko Hapus');
  const patch = (
    row: typeof healthy,
    changes: Parameters<InMemoryConnectionStore['update']>[0]['patch']
  ) =>
    connections.update({
      workspaceId: WS,
      connectionId: row.id,
      expectedVersion: row.version,
      patch: changes,
    });
  await patch(paused, { orderImportEnabled: false });
  await patch(reauth, { status: 'needs_reauth' });
  await patch(removed, { status: 'disconnected', removedAt: NOW });
  const metrics = new InMemoryIntegrationMetricsReads();
  metrics.setMetrics(WS, {
    connectionId: healthy.id,
    mappedSkuCount: 12,
    linkedWarehouseCount: 1,
    linkedWarehouseCodes: ['GDG-1'],
  });
  metrics.setMetrics(WS, { connectionId: paused.id, mappedSkuCount: 4 });
  const activity = new InMemoryIntegrationActivityReads();
  for (let i = 0; i < 25; i += 1) {
    activity.record({
      id: `a-${i}`,
      workspaceId: WS,
      action: 'integration.connected',
      connectionId: healthy.id,
      provider: 'shopee',
      storeName: 'Toko Sehat',
      actorType: 'user',
      actorId: 'user-admin',
      occurredAt: new Date(NOW.getTime() - (25 - i) * 60_000),
      payload: { connectionId: healthy.id },
    });
  }
  const deps: GetIntegrationCenterOverviewDeps = {
    connections,
    metrics,
    activity,
    now: () => NOW,
  };
  return { deps, healthy, paused, reauth };
}

describe('get integration center overview', () => {
  it('staff sees live stores with health, KPI split and zero-filled metrics', async () => {
    const { deps, healthy, paused, reauth } = await setup();
    const overview = await getIntegrationCenterOverview(deps, member('staff'), {
      workspaceId: WS,
    });
    expect(overview.kpis).toEqual({
      totalStores: 3,
      healthyActiveCount: 1,
      pausedCount: 1,
      needsReauthCount: 1,
    });
    const byId = new Map(overview.stores.map((s) => [s.connection.id, s]));
    expect([...byId.keys()].sort()).toEqual(
      [healthy.id, paused.id, reauth.id].sort()
    );
    expect(byId.get(healthy.id)?.health).toBe('healthy');
    expect(byId.get(healthy.id)?.metrics.mappedSkuCount).toBe(12);
    expect(byId.get(paused.id)?.health).toBe('paused_partial');
    expect(byId.get(reauth.id)?.health).toBe('needs_reauth');
    expect(byId.get(reauth.id)?.metrics).toMatchObject({
      connectionId: reauth.id,
      mappedSkuCount: 0,
      linkedWarehouseCount: 0,
      linkedWarehouseCodes: [],
    });
    expect(byId.get(healthy.id)?.checklist.length).toBe(5);
  });

  it('rejects foreign, inactive and missing members (tenancy forbidden)', async () => {
    const { deps } = await setup();
    const outsiders: (WorkspaceContext | null)[] = [
      null,
      member('admin', { status: 'deactivated' }),
      member('manager', { workspaceId: 'ws_other' }),
    ];
    for (const ctx of outsiders) {
      await expect(
        getIntegrationCenterOverview(deps, ctx, { workspaceId: WS })
      ).rejects.toMatchObject({ code: 'TENANCY_FORBIDDEN' });
    }
  });

  it('returns activity newest first, default 20 and clamped to the limit', async () => {
    const { deps } = await setup();
    const read = (activityLimit?: number) =>
      getIntegrationCenterOverview(deps, member('admin'), {
        workspaceId: WS,
        activityLimit,
      });
    const byDefault = await read();
    expect(byDefault.activity).toHaveLength(20);
    expect(byDefault.activity[0]?.id).toBe('a-24');
    expect(byDefault.activity[19]?.id).toBe('a-5');
    expect(byDefault.activity[0]?.summary).toEqual(expect.any(String));
    expect((await read(3)).activity.map((a) => a.id)).toEqual([
      'a-24',
      'a-23',
      'a-22',
    ]);
    expect(await read(0).then((o) => o.activity.length)).toBe(1);
    expect(await read(999).then((o) => o.activity.length)).toBe(25);
  });
});
