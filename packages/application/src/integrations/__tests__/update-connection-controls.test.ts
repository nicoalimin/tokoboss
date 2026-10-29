import type { MarketplaceConnector } from '@tokoboss/domain';
import { describe, expect, it, vi } from 'vitest';
import type { NewJobInput } from '../../jobs/job-types';
import { createInventorySyncState } from '../../inventory-sync/in-memory-inventory-sync-state';
import { InMemoryInventorySyncStore } from '../../inventory-sync/in-memory-inventory-sync-store';
import type { InventorySyncDeps } from '../../inventory-sync/inventory-sync-ports';
import { pushMappingInventory } from '../../inventory-sync/push-mapping-inventory';
import type {
  WorkspaceContext,
  WorkspaceRole,
} from '../../tenancy/tenancy-types';
import { InMemoryConnectionStore } from '../in-memory-connection-store';
import {
  INVENTORY_SYNC_JOB_TYPE,
  updateConnectionControls,
  type UpdateConnectionControlsDeps,
} from '../update-connection-controls';

/** Jeda / Lanjutkan store controls (UTA-38 / US18, RFC 07 task 15). */
const NOW = new Date('2026-10-29T03:00:00.000Z');
const WS = 'ws_controls_1';
type AuditEntry = Parameters<
  UpdateConnectionControlsDeps['audit']['append']
>[0];

const flags = (orderImportEnabled: boolean, inventorySyncEnabled: boolean) => ({
  orderImportEnabled,
  inventorySyncEnabled,
});
const member = (role: WorkspaceRole) =>
  ({
    workspaceId: WS,
    userId: `user-${role}`,
    role,
    status: 'active',
  }) as WorkspaceContext;

async function setup() {
  const connections = new InMemoryConnectionStore();
  const created = await connections.upsert({
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
  // Start paused: a first connect enables both (RFC 07 row 43b).
  const row = await connections.update({
    workspaceId: WS,
    connectionId: created.id,
    expectedVersion: created.version,
    patch: flags(false, false),
  });
  const jobs: NewJobInput[] = [];
  const audit: AuditEntry[] = [];
  const deps: UpdateConnectionControlsDeps = {
    connections,
    enqueueSync: async (input) => {
      jobs.push(input);
      return { job: { id: `job-${jobs.length}` }, duplicate: false };
    },
    audit: { append: async (entry) => void audit.push(entry) },
  };
  const update = (role: WorkspaceRole, patch: object) =>
    updateConnectionControls(deps, member(role), {
      workspaceId: WS,
      connectionId: row.id,
      ...patch,
    });
  return { connections, row, jobs, audit, update };
}

describe('update connection controls', () => {
  it('Admin pauses and resumes each switch independently with audit + catch-up', async () => {
    const { row, jobs, audit, update } = await setup();

    const on = await update('admin', { orderImportEnabled: true });
    expect(on.connection).toMatchObject(flags(true, false));
    expect(on.reconciliationQueued).toBe(false);

    const resumed = await update('admin', { inventorySyncEnabled: true });
    expect(resumed.connection).toMatchObject(flags(true, true));
    expect(resumed.reconciliationQueued).toBe(true);
    expect(jobs).toEqual([
      expect.objectContaining({
        workspaceId: WS,
        type: INVENTORY_SYNC_JOB_TYPE,
        actorId: 'user-admin',
        idempotencyKey: `inventory-sync:reconcile:${row.id}:v${resumed.connection.version}`,
        inputRef: {
          workspaceId: WS,
          connectionId: row.id,
          trigger: 'config_change',
        },
      }),
    ]);

    const paused = await update('admin', { orderImportEnabled: false });
    expect(paused.connection).toMatchObject(flags(false, true));
    expect(jobs).toHaveLength(1);
    expect(audit).toHaveLength(3);
    expect(audit[1]).toMatchObject({
      action: 'integration.controls_updated',
      actorId: 'user-admin',
      payload: {
        connectionId: row.id,
        previous: flags(true, false),
        current: flags(true, true),
        reconciliationQueued: true,
      },
    });
  });

  it('store-level Sinkronisasi Stok off skips the push and keeps SKU mappings', async () => {
    const state = createInventorySyncState({ now: () => NOW });
    state.mappings.push({
      mappingId: 'map-1',
      variantId: 'var-1',
      skuCode: 'KAOS-M',
      storeSkuText: 'KAOS-M-SHP',
      platformSkuId: 'model-1',
      channel: 'shopee',
      storeDisplayName: 'Toko Satu',
      workspaceId: WS,
      connectionId: 'conn-1',
      connectionStatus: 'connected',
      connectionInventorySyncEnabled: false,
      shopExtId: 'SHP-1',
      externalItemId: 'item-1',
      warehouses: [
        { warehouseId: 'wh-1', warehouseStatus: 'active', onHandQty: 9 },
      ],
      locationLinks: [],
    });
    const store = new InMemoryInventorySyncStore(state);
    const enabled = await store.upsertSettings({
      workspaceId: WS,
      mappingId: 'map-1',
      syncEnabled: true,
      stockBuffer: 0,
      allocationPct: 100,
    });
    const pushInventory = vi.fn();
    const connector = { pushInventory } as unknown as MarketplaceConnector;
    const deps = {
      reads: store,
      writes: store,
      connectors: { connectorFor: () => connector },
      tokenDeps: {} as InventorySyncDeps['tokenDeps'],
      audit: { append: vi.fn() },
      now: () => NOW,
      retryBackoffMs: 0,
    } satisfies InventorySyncDeps;

    const result = await pushMappingInventory(deps, {
      workspaceId: WS,
      mappingId: 'map-1',
      trigger: 'config_change',
    });

    expect(result).toBeNull();
    expect(pushInventory).not.toHaveBeenCalled();
    expect(state.mappings).toHaveLength(1);
    expect(state.states.get('map-1')).toEqual(enabled);
    expect(state.events).toEqual([]);
    expect(state.providerStock.size).toBe(0);
  });

  it('rejects Manager/Staff and resume on needs_reauth or disconnected stores', async () => {
    const { connections, row, jobs, audit, update } = await setup();
    for (const role of ['manager', 'staff'] as const) {
      await expect(
        update(role, { inventorySyncEnabled: true })
      ).rejects.toMatchObject({ code: 'ROLE_FORBIDDEN' });
    }
    expect(await connections.find(WS, row.id)).toMatchObject({
      version: row.version,
      inventorySyncEnabled: false,
    });

    let current = row;
    for (const status of ['needs_reauth', 'disconnected'] as const) {
      current = await connections.update({
        workspaceId: WS,
        connectionId: row.id,
        expectedVersion: current.version,
        patch: { status },
      });
      await expect(
        update('admin', { inventorySyncEnabled: true })
      ).rejects.toMatchObject({ code: 'INTEGRATION_VALIDATION' });
    }
    expect(current.inventorySyncEnabled).toBe(false);
    expect(jobs).toEqual([]);
    expect(audit).toEqual([]);
  });
});
