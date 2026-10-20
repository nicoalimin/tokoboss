import {
  MarketplaceConnectorError,
  type MarketplaceConnector,
  type MarketplaceListingRow,
} from '@tokoboss/domain';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryIntegrationStore } from '../in-memory-integration-store';
import {
  IMPORT_LISTING_CAP,
  IMPORT_MAX_RATE_LIMIT_SLEEPS,
  INITIAL_IMPORT_START,
  type InitialImportCursor,
  type RunInitialImportDeps,
} from '../initial-import-state';
import { runInitialImportStep } from '../run-initial-import';

/** Initial import step runner (UTA-39 / US20, RFC 04 task 44). */
const WS = 'ws_shopee_1';
type AuditEntry = Parameters<RunInitialImportDeps['audit']['append']>[0];

function listing(sku: string): MarketplaceListingRow {
  return {
    externalItemId: `item-${sku}`,
    platformSkuId: sku,
    storeSkuText: null,
    barcodeHint: null,
    title: `Produk ${sku}`,
    variantName: null,
    listingStatus: 'NORMAL',
    providerStock: 5,
  };
}

async function setup(connector: Partial<MarketplaceConnector>) {
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
    connectedBy: 'user-1',
    connectedAt: new Date('2026-10-01T00:00:00.000Z'),
  });
  await store.vault.seal(row.id, 'oauth_tokens', {
    secrets: { accessToken: 'tok' },
    grantedScopes: ['product', 'order'],
    accessTokenExpiresAt: null,
    authExpiresAt: null,
  });
  const audit: AuditEntry[] = [];
  const saved: InitialImportCursor[] = [];
  const deps: RunInitialImportDeps = {
    connections: store.connections,
    vault: store.vault,
    listings: store.listings,
    orderPreviews: store.orderPreviews,
    connectorFor: () => connector as MarketplaceConnector,
    matchableVariants: async () => [],
    mappedPlatformSkuIds: async () => new Set<string>(),
    saveCursor: async (_id, cursor) => void saved.push(cursor),
    audit: { append: async (entry) => void audit.push(entry) },
    now: () => new Date('2026-10-20T10:00:00.000Z'),
  };
  const run = (cursor: InitialImportCursor) =>
    runInitialImportStep(deps, {
      workspaceId: WS,
      connectionId: row.id,
      cursor,
    });
  return { store, row, audit, saved, run };
}

describe('run initial import step', () => {
  it('resumes listings from the saved cursor and moves on to orders', async () => {
    const listListingsPage = vi.fn(async () => ({
      rows: [listing('a'), listing('b')],
      nextCursor: null,
    }));
    const { store, saved, run } = await setup({ listListingsPage });
    const cursor = {
      ...INITIAL_IMPORT_START,
      phase: 'listings' as const,
      listingCursor: 'page-2',
      listingsImported: 3,
    };

    const next = {
      ...cursor,
      phase: 'orders',
      listingCursor: null,
      listingsImported: 5,
    };
    await expect(run(cursor)).resolves.toEqual({
      kind: 'continue',
      cursor: next,
      sleepMs: 0,
    });
    expect(listListingsPage).toHaveBeenCalledWith(expect.anything(), 'page-2');
    expect(store.listings.listings.size).toBe(2);
    expect(saved).toEqual([next]);
  });

  it('stops as incomplete once the listing cap is reached', async () => {
    const listListingsPage = vi.fn(async () => ({
      rows: [listing('z')],
      nextCursor: 'page-x',
    }));
    const { store, row, audit, saved, run } = await setup({ listListingsPage });
    const cursor = {
      ...INITIAL_IMPORT_START,
      phase: 'listings' as const,
      listingCursor: 'page-w',
      listingsImported: IMPORT_LISTING_CAP - 1,
    };

    await expect(run(cursor)).resolves.toEqual({
      kind: 'done',
      status: 'incomplete',
    });
    expect(saved).toEqual([
      {
        ...cursor,
        listingCursor: 'page-x',
        listingsImported: IMPORT_LISTING_CAP,
      },
    ]);
    const after = await store.connections.find(WS, row.id);
    expect(after?.initialImportStatus).toBe('incomplete');
    expect(audit.map((a) => a.action)).toEqual([
      'integration.import_incomplete',
    ]);
  });

  it('sleeps on rate limits, then gives up as incomplete after the max', async () => {
    const listLocations = vi.fn(async () => {
      throw new MarketplaceConnectorError('rate_limited', 'slow down', 5_000);
    });
    const { store, row, audit, saved, run } = await setup({ listLocations });

    const slept = { ...INITIAL_IMPORT_START, rateLimitSleeps: 1 };
    await expect(run(INITIAL_IMPORT_START)).resolves.toEqual({
      kind: 'sleep',
      cursor: slept,
      sleepMs: 5_000,
    });
    expect(saved).toEqual([slept]);
    expect(audit).toEqual([]);

    const maxed = {
      ...INITIAL_IMPORT_START,
      rateLimitSleeps: IMPORT_MAX_RATE_LIMIT_SLEEPS,
    };
    await expect(run(maxed)).resolves.toEqual({
      kind: 'done',
      status: 'incomplete',
    });
    const after = await store.connections.find(WS, row.id);
    expect(after?.initialImportStatus).toBe('incomplete');
    expect(audit.map((a) => a.action)).toEqual([
      'integration.import_incomplete',
    ]);
  });
});
