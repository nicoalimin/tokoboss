import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  acquireStoreClaim,
  isStoreClaimConflict,
  STORE_CLAIM_UNIQUE_CONSTRAINT,
} from '@tokoboss/application';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';
import { DrizzleMarketplaceStore } from '../repositories/drizzle-marketplace-store';
import { marketplaceStoreClaims, schema, tenants } from '../schema/index';

/** DB tests: global store claim race, release then re-claim (RFC 04 task 78). */

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../infra/drizzle');
const NOW = new Date('2026-10-22T05:00:00.000Z');
const STORE = { provider: 'shopee' as const, providerStoreId: 'shop-777' };

async function createMigratedDb() {
  const client = new PGlite();
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
  for (const file of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    await client.exec(sql); // `--> statement-breakpoint` is a SQL comment
  }
  return { client, db: drizzle(client, { schema }) };
}
type Db = Awaited<ReturnType<typeof createMigratedDb>>['db'];

/** A workspace with its own `connected` row for the shared store. */
async function seedConnectedWorkspace(db: Db, slug: string) {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Acme', slug })
    .returning();
  const workspaceId = tenant!.id;
  const connection = await new DrizzleMarketplaceStore(db).connections.upsert({
    workspaceId,
    provider: STORE.provider,
    connectMode: 'oauth_redirect',
    shop: {
      providerStoreId: STORE.providerStoreId,
      providerAccountId: null,
      shopCipher: null,
      storeName: 'Toko Kopi',
      region: 'ID',
    },
    grantedScopes: [],
    accessTokenExpiresAt: null,
    authExpiresAt: null,
    connectedBy: `admin-${slug}`,
    connectedAt: NOW,
  });
  return { workspaceId, connectionId: connection.id };
}

const claimFor = (ws: { workspaceId: string; connectionId: string }) => ({
  ...STORE,
  ...ws,
  claimedBy: `admin-${ws.workspaceId}`,
  claimedAt: NOW,
});

describe('marketplace store claims DB rules (RFC 04 task 78)', () => {
  it('lets exactly one of two racing workspaces claim a store', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const wsA = await seedConnectedWorkspace(db, 'acme-race-a');
      const wsB = await seedConnectedWorkspace(db, 'acme-race-b');
      const audits: { workspaceId: string | null; action: string }[] = [];
      const deps = {
        claims: new DrizzleMarketplaceStore(db).claims,
        audit: {
          append: async (e: (typeof audits)[number]) => {
            audits.push(e);
          },
        },
      };
      const attempt = (ws: typeof wsA) =>
        acquireStoreClaim(deps, {
          ...STORE,
          ...ws,
          actorId: `admin-${ws.workspaceId}`,
          now: NOW,
          rowConnected: false,
        });
      const results = await Promise.allSettled([attempt(wsA), attempt(wsB)]);
      const won = results.filter((r) => r.status === 'fulfilled');
      const lost = results.filter((r) => r.status === 'rejected');
      expect(won).toHaveLength(1);
      expect(lost).toHaveLength(1);
      expect((lost[0] as PromiseRejectedResult).reason).toMatchObject({
        code: 'STORE_CONNECTED_ELSEWHERE',
      });
      const winner = (won[0] as PromiseFulfilledResult<{ workspaceId: string }>)
        .value.workspaceId;
      const loser = winner === wsA.workspaceId ? wsB : wsA;
      const rows = await db.select().from(marketplaceStoreClaims);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.workspaceId).toBe(winner);
      expect(audits).toEqual([
        expect.objectContaining({
          workspaceId: loser.workspaceId,
          action: 'integration.connect_blocked',
        }),
      ]);
    } finally {
      await client.close();
    }
  });

  it('returns the owner to a losing acquire and names the constraint', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const wsA = await seedConnectedWorkspace(db, 'acme-owner-a');
      const wsB = await seedConnectedWorkspace(db, 'acme-owner-b');
      const claims = new DrizzleMarketplaceStore(db).claims;
      const first = await claims.acquire(claimFor(wsA));
      expect(first).toMatchObject({ ...STORE, ...wsA, claimedAt: NOW });
      const second = await claims.acquire(claimFor(wsB));
      expect(second).toMatchObject({ workspaceId: wsA.workspaceId });
      expect(await claims.find(STORE)).toMatchObject(wsA);
      const err = await db
        .insert(marketplaceStoreClaims)
        .values(claimFor(wsB))
        .then(
          () => null,
          (e: unknown) => e
        );
      expect(err).not.toBeNull();
      expect(isStoreClaimConflict(err)).toBe(true);
      expect(STORE_CLAIM_UNIQUE_CONSTRAINT).toBe(
        'marketplace_store_claims_provider_store_unique'
      );
    } finally {
      await client.close();
    }
  });

  it('releases only for the owner, then lets the other workspace claim', async () => {
    const { client, db } = await createMigratedDb();
    try {
      const wsA = await seedConnectedWorkspace(db, 'acme-release-a');
      const wsB = await seedConnectedWorkspace(db, 'acme-release-b');
      const claims = new DrizzleMarketplaceStore(db).claims;
      await claims.acquire(claimFor(wsA));
      const releaseAs = (workspaceId: string) =>
        claims.release({ ...STORE, workspaceId });
      expect(await releaseAs(wsB.workspaceId)).toBe(false);
      expect(await claims.find(STORE)).toMatchObject(wsA);
      expect(await releaseAs(wsA.workspaceId)).toBe(true);
      expect(await releaseAs(wsA.workspaceId)).toBe(false);
      expect(await claims.find(STORE)).toBeNull();
      const reclaimed = await claims.acquire(claimFor(wsB));
      expect(reclaimed).toMatchObject({ ...STORE, ...wsB });
      const rows = await db.select().from(marketplaceStoreClaims);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.workspaceId).toBe(wsB.workspaceId);
      expect(await claims.acquire(claimFor(wsA))).toMatchObject(wsB);
    } finally {
      await client.close();
    }
  });
});
