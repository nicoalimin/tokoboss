import {
  MarketplaceConnectorError,
  type MarketplaceConnector,
} from '@tokoboss/domain';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceContext } from '../../tenancy/tenancy-types';
import {
  connectWithCredentials,
  type ConnectWithCredentialsDeps,
} from '../connect-with-credentials';
import { InMemoryIntegrationStore } from '../in-memory-integration-store';

/** Blibli connect with seller keys (UTA-39 / US20, RFC 04 task 40). */
const NOW = new Date('2026-10-20T10:00:00.000Z');
const WS = 'ws_blibli_1';
const OTHER = 'ws_other_1';
const KEYS = {
  merchantCode: ' BLI-123 ',
  apiSellerKey: 'seller-key-secret',
  signatureKey: 'signature-key-secret',
};
type AuditEntry = Parameters<ConnectWithCredentialsDeps['audit']['append']>[0];

function admin(workspaceId: string): WorkspaceContext {
  const userId = `user-${workspaceId}`;
  return {
    workspaceId,
    userId,
    role: 'admin',
    warehouseScope: null,
    status: 'active',
    authVersion: 1,
  };
}

function setup(validate: () => Promise<void> = async () => {}) {
  const store = new InMemoryIntegrationStore();
  const audit: AuditEntry[] = [];
  const validateCredentials = vi.fn(validate);
  const connector = { validateCredentials } as unknown as MarketplaceConnector;
  const deps: ConnectWithCredentialsDeps = {
    connections: store.connections,
    claims: store.claims,
    audit: { append: async (entry) => void audit.push(entry) },
    connectorFor: () => connector,
    enabledProviders: ['blibli'],
    transaction: store.transaction,
    now: () => NOW,
  };
  const connect = (ws = WS) =>
    connectWithCredentials(deps, admin(ws), {
      ...KEYS,
      workspaceId: ws,
      provider: 'blibli',
    });
  return { store, audit, validateCredentials, connect };
}

describe('connect with credentials', () => {
  it('validates once, then saves the row, claim and sealed keys', async () => {
    const { store, audit, validateCredentials, connect } = setup();
    const saved = await connect();

    expect(saved).toMatchObject({
      workspaceId: WS,
      provider: 'blibli',
      providerStoreId: 'BLI-123',
      status: 'connected',
      connectMode: 'credential_binding',
      connectedBy: `user-${WS}`,
    });
    expect(validateCredentials).toHaveBeenCalledTimes(1);
    expect(store.transactions).toBe(1);
    const claim = await store.claims.find({
      provider: 'blibli',
      providerStoreId: 'BLI-123',
    });
    expect(claim).toMatchObject({ workspaceId: WS, connectionId: saved.id });
    expect(store.vault.sealed.get(saved.id)).toMatchObject({
      kind: 'blibli_keys',
      credentials: {
        secrets: {
          apiSellerKey: 'seller-key-secret',
          signatureKey: 'signature-key-secret',
        },
      },
    });
    expect(JSON.stringify(saved)).not.toContain('secret');
    expect(audit).toEqual([]);
  });

  it('rejects invalid keys with a neutral 400 and stores nothing', async () => {
    const { store, connect } = setup(async () => {
      throw new MarketplaceConnectorError('auth_invalid', 'bad signature');
    });
    const err = await connect().catch((e) => e);

    expect(err).toMatchObject({ code: 'INTEGRATION_VALIDATION' });
    expect(err.message).not.toContain('secret');
    expect(store.transactions).toBe(0);
    expect(store.connections.rows.size).toBe(0);
    expect(store.claims.claims.size).toBe(0);
    expect(store.vault.sealed.size).toBe(0);
  });

  it('blocks a store claimed elsewhere before sending any keys', async () => {
    const { store, audit, validateCredentials, connect } = setup();
    await connect(OTHER);
    validateCredentials.mockClear();

    const err = await connect().catch((e) => e);
    expect(err).toMatchObject({ code: 'STORE_CONNECTED_ELSEWHERE' });
    expect(err.message).not.toContain(OTHER);
    expect(validateCredentials).not.toHaveBeenCalled();
    expect(audit).toEqual([
      expect.objectContaining({
        workspaceId: WS,
        action: 'integration.connect_blocked',
      }),
    ]);
    expect(JSON.stringify(audit)).not.toContain(OTHER);
    expect(store.connections.rows.size).toBe(1);
    expect(store.vault.sealed.size).toBe(1);
  });
});
