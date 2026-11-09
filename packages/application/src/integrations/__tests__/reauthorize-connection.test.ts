import { describe, expect, it, vi } from 'vitest';
import type {
  ConnectionRecord,
  StoreClaimRecord,
} from '../integration-port-inputs';
import {
  applyReauthorization,
  assertReauthorizeSameStore,
  auditReauthorization,
  type ReauthorizeConnectionDeps,
  type ReauthorizeConnectionTx,
} from '../reauthorize-connection';

/** Reauthorize / reconnect (UTA-39 / US20, RFC 04 row 41). */
const NOW = new Date('2026-11-10T03:00:00.000Z');
const WS = 'ws_reauth_1';
const OTHER = 'ws_owner_9';
const ACTOR = `user-${WS}`;
type AuditEntry = Parameters<ReauthorizeConnectionDeps['audit']['append']>[0];

function connRow(over: Partial<ConnectionRecord> = {}): ConnectionRecord {
  return {
    id: 'conn_1',
    workspaceId: WS,
    provider: 'shopee',
    providerStoreId: 'SHP-1',
    status: 'needs_reauth',
    removedAt: null,
    ...over,
  } as ConnectionRecord;
}

function setup(owner: StoreClaimRecord | 'free') {
  const audit: AuditEntry[] = [];
  const deps: ReauthorizeConnectionDeps = {
    audit: { append: vi.fn(async (entry) => void audit.push(entry)) },
  };
  const tx: ReauthorizeConnectionTx = {
    claims: {
      find: vi.fn(async () => null),
      acquire: vi.fn(async (claim) => (owner === 'free' ? claim : owner)),
      release: vi.fn(async () => false),
    },
    listings: { setMappingsArchived: vi.fn(async () => 4) },
  };
  return { deps, tx, audit };
}

const claimOf = (workspaceId: string, connectionId: string) => ({
  provider: 'shopee' as const,
  providerStoreId: 'SHP-1',
  workspaceId,
  connectionId,
  claimedBy: 'user-first',
  claimedAt: new Date('2026-10-01T00:00:00.000Z'),
});

describe('reauthorize connection', () => {
  it('rejects a different store with one audit entry and no writes; the same store passes', async () => {
    const { deps, tx, audit } = setup('free');
    const row = connRow();
    const err = await assertReauthorizeSameStore(deps, {
      row,
      actorId: ACTOR,
      providerStoreId: 'SHP-2',
    }).catch((e: unknown) => e);

    expect(err).toMatchObject({ code: 'REAUTH_STORE_MISMATCH' });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      workspaceId: WS,
      action: 'integration.reauth_store_mismatch',
      actorId: ACTOR,
      payload: { connectionId: 'conn_1', providerStoreId: 'SHP-1' },
    });
    expect(tx.claims.acquire).not.toHaveBeenCalled();
    expect(tx.listings.setMappingsArchived).not.toHaveBeenCalled();

    await expect(
      assertReauthorizeSameStore(deps, {
        row,
        actorId: ACTOR,
        providerStoreId: ' SHP-1 ',
      })
    ).resolves.toBeUndefined();
    expect(audit).toHaveLength(1);
  });

  it('re-acquires the claim after Putuskan, confirms a kept claim, and blocks one owned elsewhere', async () => {
    const row = connRow({ status: 'disconnected' });
    const input = { row, actorId: ACTOR, now: NOW };
    const key = {
      workspaceId: WS,
      provider: 'shopee',
      providerStoreId: 'SHP-1',
    };

    const freed = setup('free');
    const got = await applyReauthorization(freed.tx, freed.deps, input);
    expect(freed.tx.claims.acquire).toHaveBeenCalledWith({
      provider: 'shopee',
      providerStoreId: 'SHP-1',
      workspaceId: WS,
      connectionId: 'conn_1',
      claimedBy: ACTOR,
      claimedAt: NOW,
    });
    expect(got).toMatchObject({
      claim: { workspaceId: WS, connectionId: 'conn_1' },
      mappingsUnarchived: 4,
    });
    expect(freed.tx.listings.setMappingsArchived).toHaveBeenCalledWith(
      key,
      null
    );
    expect(freed.audit).toHaveLength(0);

    const kept = setup(claimOf(WS, 'conn_1'));
    await expect(
      applyReauthorization(kept.tx, kept.deps, input)
    ).resolves.toMatchObject({ claim: { claimedBy: 'user-first' } });
    expect(kept.tx.listings.setMappingsArchived).toHaveBeenCalledTimes(1);

    const taken = setup(claimOf(OTHER, 'conn_owner'));
    const err = await applyReauthorization(taken.tx, taken.deps, input).catch(
      (e: unknown) => e
    );
    expect(err).toMatchObject({ code: 'STORE_CONNECTED_ELSEWHERE' });
    expect(String((err as Error).message)).not.toContain(OTHER);
    expect(taken.tx.listings.setMappingsArchived).not.toHaveBeenCalled();
    expect(taken.audit).toHaveLength(1);
    expect(taken.audit[0]).toMatchObject({
      workspaceId: WS,
      action: 'integration.connect_blocked',
      payload: { reason: 'connected_elsewhere' },
    });
    expect(JSON.stringify(taken.audit)).not.toContain(OTHER);
    expect(JSON.stringify(taken.audit)).not.toContain('conn_owner');
  });

  it('audits reconnected after a disconnect or removal, otherwise reauthorized', async () => {
    const saved = connRow({ status: 'connected' });
    const cases: [Partial<ConnectionRecord>, string][] = [
      [{ status: 'disconnected' }, 'integration.reconnected'],
      [{ status: 'needs_reauth', removedAt: NOW }, 'integration.reconnected'],
      [{ status: 'needs_reauth' }, 'integration.reauthorized'],
    ];
    for (const [over, action] of cases) {
      const { deps, audit } = setup('free');
      await auditReauthorization(deps, {
        row: connRow(over),
        actorId: ACTOR,
        saved,
        mappingsUnarchived: 2,
      });
      expect(audit).toEqual([
        expect.objectContaining({
          workspaceId: WS,
          action,
          actorId: ACTOR,
          payload: {
            connectionId: 'conn_1',
            provider: 'shopee',
            providerStoreId: 'SHP-1',
            status: 'connected',
            mappingsUnarchived: 2,
          },
        }),
      ]);
    }
  });
});
