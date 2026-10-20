import {
  MarketplaceConnectorError,
  type MarketplaceConnector,
  type MarketplaceCredentials,
} from '@tokoboss/domain';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryIntegrationStore } from '../in-memory-integration-store';
import {
  refreshConnectionTokens,
  type RefreshConnectionTokensDeps,
} from '../refresh-connection-tokens';

/** OAuth token refresh (UTA-39 / US20, RFC 04 task 42). */
const NOW = new Date('2026-10-20T10:00:00.000Z');
const WS = 'ws_shopee_1';
const SOON = new Date(NOW.getTime() + 30 * 60 * 1000);
const LATER = new Date(NOW.getTime() + 4 * 60 * 60 * 1000);
const AUTH_END = new Date('2027-10-20T10:00:00.000Z');
type AuditEntry = Parameters<RefreshConnectionTokensDeps['audit']['append']>[0];

function tokens(access: string, expiresAt: Date): MarketplaceCredentials {
  return {
    secrets: { accessToken: access, refreshToken: `refresh-${access}` },
    grantedScopes: ['product', 'order'],
    accessTokenExpiresAt: expiresAt,
    authExpiresAt: AUTH_END,
  };
}

async function setup(refresh: () => Promise<MarketplaceCredentials>) {
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
    accessTokenExpiresAt: SOON,
    authExpiresAt: AUTH_END,
    connectedBy: 'user-1',
    connectedAt: new Date('2026-10-01T00:00:00.000Z'),
  });
  await store.vault.seal(row.id, 'oauth_tokens', tokens('old', SOON));
  const audit: AuditEntry[] = [];
  const refreshFn = vi.fn(refresh);
  const connector = { refresh: refreshFn } as unknown as MarketplaceConnector;
  // SQL's version-guarded UPDATE is atomic; the fake reads then writes
  // across an await, so serialize its updates like a row lock.
  let lock: Promise<unknown> = Promise.resolve();
  const connections: RefreshConnectionTokensDeps['connections'] = {
    find: (workspaceId, id) => store.connections.find(workspaceId, id),
    update: (input) => {
      const next = lock.then(() => store.connections.update(input));
      lock = next.catch(() => null);
      return next;
    },
  };
  const deps: RefreshConnectionTokensDeps = {
    connections,
    vault: store.vault,
    connectorFor: () => connector,
    audit: { append: async (entry) => void audit.push(entry) },
    transaction: store.transaction,
    now: () => NOW,
  };
  const run = () =>
    refreshConnectionTokens(deps, { workspaceId: WS, connectionId: row.id });
  return { store, row, audit, refreshFn, run };
}

describe('refresh connection tokens', () => {
  it('rotates expiring tokens and seals them with the row update', async () => {
    const next = tokens('new', LATER);
    const { store, row, audit, refreshFn, run } = await setup(async () => next);

    await expect(run()).resolves.toBe('refreshed');
    expect(refreshFn).toHaveBeenCalledTimes(1);
    expect(refreshFn).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'shopee',
        shop: expect.objectContaining({ providerStoreId: 'SHP-1' }),
        credentials: expect.objectContaining({
          secrets: expect.objectContaining({ accessToken: 'old' }),
        }),
      })
    );
    expect(store.transactions).toBe(1);
    expect(await store.connections.find(WS, row.id)).toMatchObject({
      status: 'connected',
      accessTokenExpiresAt: LATER,
      authExpiresAt: AUTH_END,
      lastRefreshedAt: NOW,
      lastErrorCode: null,
    });
    expect(store.vault.sealed.get(row.id)).toMatchObject({
      kind: 'oauth_tokens',
      credentials: { secrets: { accessToken: 'new' } },
    });
    expect(audit).toEqual([]);
    await expect(run()).resolves.toBe('skipped');
    expect(refreshFn).toHaveBeenCalledTimes(1);
  });

  it('lets only one of two concurrent runs call the provider', async () => {
    const { store, row, refreshFn, run } = await setup(async () =>
      tokens('new', LATER)
    );

    const outcomes = await Promise.all([run(), run()]);
    expect(outcomes.sort()).toEqual(['refreshed', 'skipped']);
    expect(refreshFn).toHaveBeenCalledTimes(1);
    expect(store.transactions).toBe(1);
    expect(store.vault.sealed.get(row.id)?.credentials.secrets).toMatchObject({
      accessToken: 'new',
    });
  });

  it('marks an invalid grant needs_reauth and audits it once', async () => {
    const { store, row, audit, run } = await setup(async () => {
      throw new MarketplaceConnectorError('auth_invalid', 'invalid grant');
    });

    await expect(run()).resolves.toBe('needs_reauth');
    expect(await store.connections.find(WS, row.id)).toMatchObject({
      status: 'needs_reauth',
      lastErrorCode: 'MARKETPLACE_AUTH_INVALID',
      lastRefreshedAt: null,
    });
    expect(store.transactions).toBe(0);
    expect(store.vault.sealed.get(row.id)?.credentials.secrets).toMatchObject({
      accessToken: 'old',
    });
    expect(audit).toEqual([
      expect.objectContaining({
        workspaceId: WS,
        action: 'integration.token_refresh_failed',
        actorType: 'system',
        payload: {
          connectionId: row.id,
          provider: 'shopee',
          providerStoreId: 'SHP-1',
        },
      }),
    ]);
    expect(JSON.stringify(audit)).not.toContain('refresh-old');
  });
});
