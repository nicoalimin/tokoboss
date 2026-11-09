import { describe, expect, it, vi } from 'vitest';
import {
  deriveCapabilities,
  MarketplaceConnectorError,
  type MarketplaceConnector,
} from '@tokoboss/domain';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import {
  completeOAuthConnection,
  type CompleteOAuthConnectionDeps,
} from '../complete-oauth-connection';
import { InMemoryIntegrationStore } from '../in-memory-integration-store';
import type { OAuthStateRecord } from '../integration-port-inputs';

/** Complete OAuth + per-shop persist (UTA-39 / US20, RFC 04 39b: 21b + 21c). */
const NOW = new Date('2026-11-10T03:00:00.000Z');
const WS = 'ws_oauth_1';
const OTHER = 'ws_owner_9';
type AuditEntry = Parameters<CompleteOAuthConnectionDeps['audit']['append']>[0];

const creds = (tag: string) => ({
  secrets: { accessToken: `at-${tag}`, refreshToken: `rt-${tag}` },
  grantedScopes: ['product', 'order'],
  accessTokenExpiresAt: new Date('2026-11-11T00:00:00.000Z'),
  authExpiresAt: new Date('2027-11-01T00:00:00.000Z'),
});
const shop = (id: string) => ({
  providerStoreId: id,
  providerAccountId: null,
  shopCipher: `cipher-${id}`,
  storeName: id,
  region: 'ID',
});
const member = (role: WorkspaceContext['role']): WorkspaceContext => ({
  workspaceId: WS,
  userId: `user-${WS}`,
  role,
  warehouseScope: null,
  status: 'active',
  authVersion: 1,
});
const state = (connectionId: string | null): OAuthStateRecord => ({
  id: 'state_1',
  workspaceId: WS,
  provider: 'tiktok_shop',
  userId: `user-${WS}`,
  connectionId,
  expiresAt: NOW,
  consumedAt: null,
});

function setup(shops: string[], missing: string[] = [], tag = 'new') {
  const store = new InMemoryIntegrationStore();
  const audit: AuditEntry[] = [];
  const exchangeAuthCode = vi.fn(async () => ({
    credentials: creds(tag),
    shops: shops.map(shop),
  }));
  const connector = {
    exchangeAuthCode,
    describeCapabilities: () => ({
      capabilities: deriveCapabilities({}),
      missingPermissions: missing,
    }),
  } as unknown as MarketplaceConnector;
  const deps: CompleteOAuthConnectionDeps = {
    connections: store.connections,
    claims: store.claims,
    audit: { append: vi.fn(async (entry) => void audit.push(entry)) },
    transaction: store.transaction,
    now: () => NOW,
    connectorFor: () => connector,
    redirectUri: () => 'https://app.example/integrations/callback',
  };
  const run = (connectionId: string | null = null, ctx = member('admin')) =>
    completeOAuthConnection(deps, ctx, {
      state: state(connectionId),
      query: { code: ' abc ' },
    });
  return { store, audit, deps, exchangeAuthCode, run };
}

const ownerClaim = (providerStoreId: string, connectionId: string) => ({
  provider: 'tiktok_shop' as const,
  providerStoreId,
  workspaceId: OTHER,
  connectionId,
  claimedBy: 'user-owner',
  claimedAt: NOW,
});

describe('complete oauth connection', () => {
  it('exchanges the code once and connects every shop; a missing permission is needs_reauth', async () => {
    const { store, audit, exchangeAuthCode, run } = setup(['T1', 'T2']);
    const out = await run();
    expect(exchangeAuthCode).toHaveBeenCalledTimes(1);
    expect(exchangeAuthCode).toHaveBeenCalledWith({
      code: 'abc',
      redirectUri: 'https://app.example/integrations/callback',
      query: { code: ' abc ' },
    });
    expect(out.map((o) => o.result)).toEqual(['connected', 'connected']);
    expect(store.vault.sealed.size).toBe(2);
    expect([...store.vault.sealed.values()][0]?.kind).toBe('oauth_tokens');
    expect(store.claims.claims.size).toBe(2);
    const connected = audit.filter((a) => a.action === 'integration.connected');
    expect(connected).toHaveLength(2);
    expect(JSON.stringify(out)).not.toContain('at-new');
    const row = [...store.connections.rows.values()][0];
    expect(row?.connectMode).toBe('oauth_redirect');

    const partial = setup(['T9'], ['inventory.write']);
    const [only] = await partial.run();
    expect(only?.result).toBe('needs_reauth');
    const saved = [...partial.store.connections.rows.values()][0];
    expect(saved?.missingPermissions).toEqual(['inventory.write']);
  });

  it('blocks a shop owned elsewhere without sealing (owner tokens untouched); other shops proceed; an in-tx race rolls back', async () => {
    const { store, audit, run } = setup(['T1', 'T2']);
    await store.claims.acquire(ownerClaim('T1', 'conn_owner'));
    await store.vault.seal('conn_owner', 'oauth_tokens', creds('owner'));
    const out = await run();
    expect(out).toEqual([
      { providerStoreId: 'T1', connectionId: null, result: 'blocked' },
      expect.objectContaining({ providerStoreId: 'T2', result: 'connected' }),
    ]);
    const owner = store.vault.sealed.get('conn_owner');
    expect(owner?.credentials.secrets.accessToken).toBe('at-owner');
    expect(store.vault.sealed.size).toBe(2);
    const blocked = audit.filter(
      (a) => a.action === 'integration.connect_blocked'
    );
    expect(blocked).toEqual([expect.objectContaining({ workspaceId: WS })]);
    expect(JSON.stringify(out)).not.toContain(OTHER);
    expect(JSON.stringify(audit)).not.toContain(OTHER);

    const race = setup(['T5']);
    race.deps.claims = { find: vi.fn(async () => null) };
    await race.store.claims.acquire(ownerClaim('T5', 'conn_o5'));
    const [lost] = await race.run();
    expect(lost?.result).toBe('blocked');
    expect(race.store.vault.sealed.size).toBe(0);
    expect(race.store.connections.rows.size).toBe(0);
  });

  it('reauthorizes the same store after Putuskan, rejects a different store, and maps exchange errors', async () => {
    const { store, audit, run } = setup(['T1']);
    const [first] = await run();
    const id = first?.connectionId ?? '';
    await store.claims.release({
      provider: 'tiktok_shop',
      providerStoreId: 'T1',
      workspaceId: WS,
    });
    const row = store.connections.rows.get(id);
    if (row) store.connections.rows.set(id, { ...row, status: 'disconnected' });
    const unarchive = vi.spyOn(store.listings, 'setMappingsArchived');
    const again = await run(id);
    expect(again).toEqual([
      { providerStoreId: 'T1', connectionId: id, result: 'connected' },
    ]);
    expect(unarchive).toHaveBeenCalledWith(
      { workspaceId: WS, provider: 'tiktok_shop', providerStoreId: 'T1' },
      null
    );
    expect(audit.at(-1)?.action).toBe('integration.reconnected');
    expect(store.claims.claims.get('tiktok_shop:T1')?.workspaceId).toBe(WS);

    const m = setup(['T7'], [], 'mine');
    const [f] = await m.run();
    const mid = f?.connectionId ?? '';
    m.exchangeAuthCode.mockResolvedValueOnce({
      credentials: creds('other'),
      shops: [shop('T8')],
    });
    const [mismatch] = await m.run(mid);
    expect(mismatch?.result).toBe('mismatch');
    expect(m.audit.at(-1)?.action).toBe('integration.reauth_store_mismatch');
    const kept = m.store.vault.sealed.get(mid);
    expect(kept?.credentials.secrets.accessToken).toBe('at-mine');
    expect(m.store.connections.rows.size).toBe(1);

    const cases = [
      ['rate_limited', 'PROVIDER_UNAVAILABLE'],
      ['auth_invalid', 'CONNECT_FAILED'],
      ['unsupported_account', 'CONNECT_FAILED'],
    ] as const;
    for (const [kind, code] of cases) {
      const err = new MarketplaceConnectorError(kind, 'provider said no');
      m.exchangeAuthCode.mockRejectedValueOnce(err);
      await expect(m.run()).rejects.toMatchObject({ code });
    }
    const denied = m.run(null, member('manager'));
    await expect(denied).rejects.toMatchObject({ code: 'ROLE_FORBIDDEN' });
    expect(m.exchangeAuthCode).toHaveBeenCalledTimes(5);
    expect(m.store.connections.rows.size).toBe(1);
  });
});
