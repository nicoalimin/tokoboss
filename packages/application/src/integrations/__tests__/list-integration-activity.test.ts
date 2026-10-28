import { describe, expect, it } from 'vitest';
import type {
  WorkspaceContext,
  WorkspaceRole,
} from '../../tenancy/tenancy-types';
import { InMemoryConnectionStore } from '../in-memory-connection-store';
import { InMemoryIntegrationActivityReads } from '../in-memory-integration-management-reads';
import type { IntegrationActivityEntry } from '../integration-management-ports';
import {
  listIntegrationActivity,
  type ListIntegrationActivityDeps,
} from '../list-integration-activity';

/** Log Aktivitas & Audit Integrasi feed (UTA-38 / US18, RFC 07 task 16). */
const NOW = new Date('2026-10-29T03:00:00.000Z');
const WS = 'ws_activity_1';

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
  const row = await connections.upsert({
    workspaceId: WS,
    provider: 'shopee',
    connectMode: 'oauth_redirect',
    shop: {
      providerStoreId: 'SHP-1',
      providerAccountId: null,
      shopCipher: null,
      storeName: 'Toko Satu',
      region: 'ID',
    },
    grantedScopes: ['product', 'order'],
    accessTokenExpiresAt: null,
    authExpiresAt: null,
    connectedBy: 'user-admin',
    connectedAt: NOW,
  });
  const activity = new InMemoryIntegrationActivityReads();
  const entry = (
    id: string,
    minutesAgo: number,
    action: IntegrationActivityEntry['action'],
    payload: Record<string, unknown> = {},
    overrides: Partial<IntegrationActivityEntry> = {}
  ) =>
    activity.record({
      id,
      workspaceId: WS,
      action,
      connectionId: row.id,
      provider: 'shopee',
      storeName: 'Toko Satu',
      actorType: 'user',
      actorId: 'user-admin',
      occurredAt: new Date(NOW.getTime() - minutesAgo * 60_000),
      payload: { connectionId: row.id, ...payload },
      ...overrides,
    });
  entry('a-1', 30, 'integration.connected');
  entry('a-2', 10, 'integration.controls_updated', {
    current: { orderImportEnabled: false, inventorySyncEnabled: true },
    reconciliationQueued: true,
  });
  entry('a-3', 20, 'integration.location_linked', {}, { connectionId: null });
  entry('x-1', 5, 'integration.removed', {}, { workspaceId: 'ws_other' });
  const deps: ListIntegrationActivityDeps = { connections, activity };
  return { connections, row, deps };
}

describe('list integration activity', () => {
  it('Admin, Manager and Staff read the workspace and store feed with impact', async () => {
    const { row, deps } = await setup();
    for (const role of ['admin', 'manager', 'staff'] as const) {
      const feed = await listIntegrationActivity(deps, member(role), {
        workspaceId: WS,
      });
      expect(feed.items.map((item) => item.id)).toEqual(['a-2', 'a-3', 'a-1']);
      expect(feed.items.map((item) => item.summary)).toEqual([
        'Impor order dijeda · Sinkron stok aktif · rekonsiliasi stok diantrikan',
        'Gudang sumber stok ditautkan.',
        'Toko terhubung; impor order & sinkron stok aktif.',
      ]);

      const store = await listIntegrationActivity(deps, member(role), {
        workspaceId: WS,
        connectionId: row.id,
      });
      expect(store.items.map((item) => item.id)).toEqual(['a-2', 'a-1']);
      expect(store.items[0]).toMatchObject({
        action: 'integration.controls_updated',
        connectionId: row.id,
        storeName: 'Toko Satu',
        actorId: 'user-admin',
      });
    }

    const capped = await listIntegrationActivity(deps, member('staff'), {
      workspaceId: WS,
      limit: 0,
    });
    expect(capped.items.map((item) => item.id)).toEqual(['a-2']);
  });

  it('rejects non-active or foreign members and unknown or removed stores', async () => {
    const { connections, row, deps } = await setup();
    const outsiders: (WorkspaceContext | null)[] = [
      null,
      member('admin', { status: 'deactivated' }),
      member('staff', { status: 'deactivated' }),
      member('manager', { workspaceId: 'ws_other' }),
    ];
    for (const ctx of outsiders) {
      await expect(
        listIntegrationActivity(deps, ctx, { workspaceId: WS })
      ).rejects.toMatchObject({ code: 'TENANCY_FORBIDDEN' });
    }

    await expect(
      listIntegrationActivity(deps, member('staff'), {
        workspaceId: WS,
        connectionId: 'conn-missing',
      })
    ).rejects.toMatchObject({ code: 'CONNECTION_NOT_FOUND' });

    await connections.update({
      workspaceId: WS,
      connectionId: row.id,
      expectedVersion: row.version,
      patch: { status: 'disconnected', removedAt: NOW },
    });
    await expect(
      listIntegrationActivity(deps, member('admin'), {
        workspaceId: WS,
        connectionId: row.id,
      })
    ).rejects.toMatchObject({ code: 'CONNECTION_NOT_FOUND' });
  });
});
