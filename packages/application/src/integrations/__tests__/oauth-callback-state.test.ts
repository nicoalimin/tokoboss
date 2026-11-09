import { describe, expect, it, vi } from 'vitest';
import { hashToken } from '../../auth/crypto';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import type { CredentialPrecheckDeps } from '../credential-precheck';
import type { OAuthStateRecord } from '../integration-port-inputs';
import {
  consumeOAuthCallbackState,
  precheckOAuthCallback,
} from '../oauth-callback-state';

/** OAuth callback state + pre-exchange checks (UTA-39 / US20, RFC 04 39a). */
const NOW = new Date('2026-11-10T02:00:00.000Z');
const WS = 'ws_oauth_1';
const OTHER = 'ws_owner_9';
type AuditEntry = Parameters<CredentialPrecheckDeps['audit']['append']>[0];

function stateRecord(over: Partial<OAuthStateRecord> = {}): OAuthStateRecord {
  return {
    id: 'state_1',
    workspaceId: WS,
    provider: 'shopee',
    userId: `user-${WS}`,
    connectionId: null,
    expiresAt: new Date(NOW.getTime() + 600_000),
    consumedAt: null,
    ...over,
  };
}

function member(role: WorkspaceContext['role'], userId = `user-${WS}`) {
  const ctx: WorkspaceContext = {
    workspaceId: WS,
    userId,
    role,
    warehouseScope: null,
    status: 'active',
    authVersion: 1,
  };
  return ctx;
}

function precheckDeps(owner: string | null) {
  const audit: AuditEntry[] = [];
  const deps: CredentialPrecheckDeps = {
    connections: {
      find: vi.fn(async () => null),
      findByStore: vi.fn(async () => null),
    },
    claims: {
      find: vi.fn(async (key) =>
        owner
          ? { ...key, workspaceId: owner, connectionId: 'conn_owner' }
          : null
      ),
    },
    audit: { append: vi.fn(async (entry) => void audit.push(entry)) },
  };
  return { deps, audit };
}

describe('oauth callback state', () => {
  it('consumes the hashed state once; replayed, other-provider or blank state is STATE_INVALID', async () => {
    const issued = stateRecord();
    let used = false;
    const consume = vi.fn(async (hash: string) => {
      if (used || hash !== hashToken('raw-state')) return null;
      used = true;
      return issued;
    });
    const deps = {
      oauthStates: { consume },
      enabledProviders: ['shopee', 'tiktok_shop'] as const,
      now: () => NOW,
    };
    const run = (provider: string, state: string | null) =>
      consumeOAuthCallbackState(deps, { provider, state });

    await expect(run('shopee', ' raw-state ')).resolves.toBe(issued);
    expect(consume).toHaveBeenCalledWith(hashToken('raw-state'), NOW);
    await expect(run('shopee', 'raw-state')).rejects.toMatchObject({
      code: 'STATE_INVALID',
    });

    used = false;
    await expect(run('tiktok_shop', 'raw-state')).rejects.toMatchObject({
      code: 'STATE_INVALID',
    });
    for (const blank of [null, '', '   ']) {
      await expect(run('shopee', blank)).rejects.toMatchObject({
        code: 'STATE_INVALID',
      });
    }
    expect(consume).toHaveBeenCalledTimes(3);
  });

  it('requires the same Admin and a code before any store check', async () => {
    const { deps, audit } = precheckDeps(null);
    const query = { code: 'auth-code', shop_id: '555' };
    const run = (ctx: WorkspaceContext, q: Record<string, string> = query) =>
      precheckOAuthCallback(deps, ctx, { state: stateRecord(), query: q });

    await expect(run(member('manager'))).rejects.toMatchObject({
      code: 'ROLE_FORBIDDEN',
    });
    await expect(
      run(member('admin', 'user-someone-else'))
    ).rejects.toMatchObject({ code: 'STATE_INVALID' });
    await expect(
      run(member('admin'), { shop_id: '555' })
    ).rejects.toMatchObject({
      code: 'CONNECT_FAILED',
      details: { reason: 'cancelled' },
    });
    await expect(
      run(member('admin'), { code: '  ', shop_id: '555' })
    ).rejects.toMatchObject({ code: 'CONNECT_FAILED' });
    expect(deps.claims.find).not.toHaveBeenCalled();
    expect(audit).toHaveLength(0);

    await expect(run(member('admin'))).resolves.toBeNull();
    expect(deps.claims.find).toHaveBeenCalledWith({
      provider: 'shopee',
      providerStoreId: '555',
    });
  });

  it('blocks a Shopee shop claimed elsewhere before exchange, audited here without naming the owner', async () => {
    const { deps, audit } = precheckDeps(OTHER);
    const err = await precheckOAuthCallback(deps, member('admin'), {
      state: stateRecord(),
      query: { code: 'auth-code', shop_id: ' 777 ' },
    }).catch((e: unknown) => e);

    expect(err).toMatchObject({ code: 'STORE_CONNECTED_ELSEWHERE' });
    expect(String((err as Error).message)).not.toContain(OTHER);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      workspaceId: WS,
      action: 'integration.connect_blocked',
      actorId: `user-${WS}`,
      payload: {
        provider: 'shopee',
        providerStoreId: '777',
        reason: 'connected_elsewhere',
      },
    });
    expect(JSON.stringify(audit)).not.toContain(OTHER);
    expect(JSON.stringify(audit)).not.toContain('conn_owner');
  });
});
