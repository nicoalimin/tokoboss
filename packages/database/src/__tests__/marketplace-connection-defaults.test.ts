import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  type ConnectionStore,
  InMemoryConnectionStore,
  type UpsertConnectionInput,
} from '@tokoboss/application';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';
import { DrizzleMarketplaceStore } from '../repositories/drizzle-marketplace-store';
import { schema, tenants } from '../schema/index';

/** Connect defaults: first connect on, reconnect after Putuskan paused (RFC 07 row 43c). */

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../infra/drizzle');
const NOW = new Date('2026-10-30T02:00:00.000Z');

async function createMigratedDb() {
  const client = new PGlite();
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
  for (const file of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    await client.exec(sql); // `--> statement-breakpoint` is a SQL comment
  }
  const db = drizzle(client, { schema });
  const [tenant] = await db
    .insert(tenants)
    .values({ name: 'Acme', slug: 'acme-defaults' })
    .returning();
  return { client, db, workspaceId: tenant!.id };
}

const connectInput = (workspaceId: string): UpsertConnectionInput => ({
  workspaceId,
  provider: 'shopee',
  connectMode: 'oauth_redirect',
  shop: {
    providerStoreId: 'shop-43c',
    providerAccountId: null,
    shopCipher: null,
    storeName: 'Toko Kopi',
    region: 'ID',
  },
  grantedScopes: [],
  accessTokenExpiresAt: null,
  authExpiresAt: null,
  connectedBy: 'user-admin',
  connectedAt: NOW,
});

/** First connect, Putuskan (as disconnectConnection patches), reconnect. */
async function connectPutuskanReconnect(
  store: ConnectionStore,
  workspaceId: string
) {
  const first = await store.upsert(connectInput(workspaceId));
  await store.update({
    workspaceId,
    connectionId: first.id,
    expectedVersion: first.version,
    patch: {
      status: 'disconnected',
      disconnectSource: 'admin',
      disconnectedAt: NOW,
      disconnectedBy: 'user-admin',
      orderImportEnabled: false,
      inventorySyncEnabled: false,
    },
  });
  const again = await store.upsert(connectInput(workspaceId));
  return { first, again };
}

const on = { orderImportEnabled: true, inventorySyncEnabled: true };
const off = { orderImportEnabled: false, inventorySyncEnabled: false };

describe('marketplace connection defaults (RFC 07 row 43)', () => {
  it('Drizzle: a first connect starts with order import and stock sync on', async () => {
    const { client, db, workspaceId } = await createMigratedDb();
    try {
      const store = new DrizzleMarketplaceStore(db).connections;
      const row = await store.upsert(connectInput(workspaceId));
      expect(row).toMatchObject({ status: 'connected', ...on });
      expect(await store.find(workspaceId, row.id)).toMatchObject(on);
    } finally {
      await client.close();
    }
  });

  it('Drizzle: a reconnect after Putuskan stays paused until an Admin resumes', async () => {
    const { client, db, workspaceId } = await createMigratedDb();
    try {
      const store = new DrizzleMarketplaceStore(db).connections;
      const { first, again } = await connectPutuskanReconnect(
        store,
        workspaceId
      );
      expect(first).toMatchObject(on);
      expect(again).toMatchObject({
        id: first.id,
        status: 'connected',
        ...off,
      });
      expect(again.disconnectedAt).toBeNull();
    } finally {
      await client.close();
    }
  });

  it('in-memory fake mirrors the same defaults', async () => {
    const store = new InMemoryConnectionStore();
    const { first, again } = await connectPutuskanReconnect(store, 'ws-43c');
    expect(first).toMatchObject({ status: 'connected', ...on });
    expect(again).toMatchObject({ id: first.id, status: 'connected', ...off });
  });
});
