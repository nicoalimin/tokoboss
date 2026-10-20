import { describe, expect, it } from 'vitest';
import type {
  WorkspaceContext,
  WorkspaceRole,
} from '../../tenancy/tenancy-types';
import {
  disconnectConnection,
  type DisconnectConnectionDeps,
} from '../disconnect-connection';
import { InMemoryIntegrationStore } from '../in-memory-integration-store';
import { removeConnection } from '../remove-connection';

/** Putuskan + Hapus koneksi (UTA-39 / US20, RFC 04 task 46). */
const NOW = new Date('2026-10-20T10:00:00.000Z');
const WS = 'ws_shopee_1';
const STORE = { provider: 'shopee' as const, providerStoreId: 'SHP-1' };
type AuditEntry = Parameters<DisconnectConnectionDeps['audit']['append']>[0];

function member(role: WorkspaceRole): WorkspaceContext {
  return {
    workspaceId: WS,
    userId: `user-${role}`,
    role,
    warehouseScope: null,
    status: 'active',
    authVersion: 1,
  };
}

async function setup() {
  const store = new InMemoryIntegrationStore();
  const row = await store.connections.upsert({
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
    connectedAt: new Date('2026-10-01T00:00:00.000Z'),
  });
  await store.claims.acquire({
    ...STORE,
    workspaceId: WS,
    connectionId: row.id,
    claimedBy: 'user-admin',
    claimedAt: new Date('2026-10-01T00:00:00.000Z'),
  });
  await store.vault.seal(row.id, 'oauth_tokens', {
    secrets: { accessToken: 'a', refreshToken: 'r' },
    grantedScopes: ['product', 'order'],
    accessTokenExpiresAt: null,
    authExpiresAt: null,
  });
  store.listings.mappings.push({ ...STORE, workspaceId: WS, archivedAt: null });
  const audit: AuditEntry[] = [];
  const deps = {
    connections: store.connections,
    audit: { append: async (entry: AuditEntry) => void audit.push(entry) },
    transaction: store.transaction,
    now: () => NOW,
  };
  const input = { workspaceId: WS, connectionId: row.id };
  const disconnect = (role: WorkspaceRole = 'admin') =>
    disconnectConnection(deps, member(role), input);
  const remove = (role: WorkspaceRole = 'admin') =>
    removeConnection(deps, member(role), input);
  return { store, row, audit, disconnect, remove };
}

describe('disconnect and remove connection', () => {
  it('Putuskan releases the claim, shreds keys and keeps mappings', async () => {
    const { store, row, audit, disconnect } = await setup();

    const saved = await disconnect();

    expect(saved).toMatchObject({
      status: 'disconnected',
      disconnectSource: 'admin',
      disconnectedAt: NOW,
      disconnectedBy: 'user-admin',
      removedAt: null,
    });
    expect(await store.claims.find(STORE)).toBeNull();
    expect(await store.vault.open(row.id)).toBeNull();
    expect(store.listings.mappings[0]?.archivedAt).toBeNull();
    expect(audit).toEqual([
      expect.objectContaining({
        action: 'integration.disconnected',
        actorId: 'user-admin',
        payload: expect.objectContaining({
          connectionId: row.id,
          source: 'admin',
          claimReleased: true,
        }),
      }),
    ]);
    expect(await disconnect()).toMatchObject({ version: saved.version });
    expect(audit).toHaveLength(1);
  });

  it('Hapus archives mappings and soft-removes the disconnected row', async () => {
    const { store, row, audit, disconnect, remove } = await setup();
    await expect(remove()).rejects.toMatchObject({
      code: 'INTEGRATION_VALIDATION',
    });
    await disconnect();

    const saved = await remove();

    expect(saved.removedAt).toEqual(NOW);
    expect(store.listings.mappings[0]?.archivedAt).toEqual(NOW);
    expect(audit.map((e) => e.action)).toEqual([
      'integration.disconnected',
      'integration.removed',
    ]);
    expect(audit[1]?.payload).toMatchObject({
      connectionId: row.id,
      mappingsArchived: 1,
      claimReleased: false,
    });
    await expect(remove()).rejects.toMatchObject({
      code: 'CONNECTION_NOT_FOUND',
    });
  });

  it('forbids a Manager from Putuskan and Hapus without writing', async () => {
    const { store, row, audit, disconnect, remove } = await setup();

    await expect(disconnect('manager')).rejects.toMatchObject({
      code: 'ROLE_FORBIDDEN',
    });
    await expect(remove('manager')).rejects.toMatchObject({
      code: 'ROLE_FORBIDDEN',
    });

    expect(await store.connections.find(WS, row.id)).toMatchObject({
      status: 'connected',
      version: row.version,
    });
    expect(await store.claims.find(STORE)).not.toBeNull();
    expect(await store.vault.open(row.id)).not.toBeNull();
    expect(store.transactions).toBe(0);
    expect(audit).toEqual([]);
  });
});
