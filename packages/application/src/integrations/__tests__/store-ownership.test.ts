import { describe, expect, it } from 'vitest';
import { InMemoryStoreClaimStore } from '../in-memory-auth-stores';
import {
  STORE_CLAIM_UNIQUE_CONSTRAINT,
  acquireStoreClaim,
  type AcquireStoreClaimInput,
  type StoreOwnershipDeps,
} from '../store-ownership';

/** Store ownership rules (UTA-39 / US20, RFC 04 task 38). */
const NOW = new Date('2026-10-20T10:00:00.000Z');
const OWNER = 'ws_owner_1';
const OTHER = 'ws_other_1';
const STORE = { provider: 'shopee' as const, providerStoreId: 'shop-777' };

type AuditEntry = Parameters<StoreOwnershipDeps['audit']['append']>[0];

function setup() {
  const claims = new InMemoryStoreClaimStore();
  const audit: AuditEntry[] = [];
  const deps: StoreOwnershipDeps = {
    claims,
    audit: { append: async (entry) => void audit.push(entry) },
  };
  return { claims, audit, deps };
}

function attempt(
  workspaceId: string,
  rowConnected = false
): AcquireStoreClaimInput {
  return {
    ...STORE,
    workspaceId,
    connectionId: `conn-${workspaceId}`,
    actorId: `user-${workspaceId}`,
    now: NOW,
    rowConnected,
  };
}

const blocked = { code: 'STORE_CONNECTED_ELSEWHERE' };

describe('store ownership', () => {
  it('blocks another workspace with a neutral error audited only there', async () => {
    const { claims, audit, deps } = setup();
    await acquireStoreClaim(deps, attempt(OWNER));

    const err = await acquireStoreClaim(deps, attempt(OTHER)).catch((e) => e);
    expect(err).toMatchObject(blocked);
    expect(err.message).not.toContain(OWNER);
    expect(audit).toEqual([
      {
        workspaceId: OTHER,
        action: 'integration.connect_blocked',
        category: 'workspace',
        actorId: `user-${OTHER}`,
        payload: { ...STORE, reason: 'connected_elsewhere' },
      },
    ]);
    expect(JSON.stringify(audit)).not.toContain(OWNER);
    expect((await claims.find(STORE))?.workspaceId).toBe(OWNER);
  });

  it('lets the owning workspace reconnect, but not while its row is connected', async () => {
    const { audit, deps } = setup();
    const first = await acquireStoreClaim(deps, attempt(OWNER));
    expect(first).toMatchObject({ ...STORE, workspaceId: OWNER });

    const again = await acquireStoreClaim(deps, attempt(OWNER));
    expect(again).toEqual(first);
    await expect(
      acquireStoreClaim(deps, attempt(OWNER, true))
    ).rejects.toMatchObject({ code: 'ALREADY_CONNECTED' });
    expect(audit).toEqual([]);
  });

  it('maps a simulated unique violation to the same blocked error', async () => {
    const { claims, audit, deps } = setup();
    const unique = { code: '23505', constraint: STORE_CLAIM_UNIQUE_CONSTRAINT };
    claims.acquire = async () => {
      throw unique;
    };
    await expect(acquireStoreClaim(deps, attempt(OTHER))).rejects.toMatchObject(
      blocked
    );

    claims.acquire = async () => {
      throw new Error('insert failed', { cause: unique });
    };
    await expect(acquireStoreClaim(deps, attempt(OTHER))).rejects.toMatchObject(
      blocked
    );
    expect(audit).toHaveLength(2);
    expect(audit.every((a) => a.workspaceId === OTHER)).toBe(true);

    const boom = new Error('db down');
    claims.acquire = async () => {
      throw boom;
    };
    await expect(acquireStoreClaim(deps, attempt(OTHER))).rejects.toBe(boom);
    expect(audit).toHaveLength(2);
  });
});
