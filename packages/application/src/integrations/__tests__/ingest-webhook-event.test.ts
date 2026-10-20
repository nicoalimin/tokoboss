import type {
  MarketplaceConnector,
  MarketplaceWebhookEvent,
  MarketplaceWebhookRequest,
} from '@tokoboss/domain';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryIntegrationStore } from '../in-memory-integration-store';
import {
  ingestWebhookEvent,
  type IngestWebhookEventDeps,
} from '../ingest-webhook-event';

/** Webhook intake (UTA-39 / US20, RFC 04 task 43). */
const WS = 'ws_shopee_1';
const REQUEST: MarketplaceWebhookRequest = {
  rawBody: '{"shop_id":"SHP-1"}',
  headers: { authorization: 'sig' },
  url: 'https://app.tokoboss.id/api/webhooks/shopee',
};

function event(dedupeKey: string, providerStoreId: string | null) {
  return {
    dedupeKey,
    eventType: 'order_status_update',
    providerStoreId,
    payload: { dedupeKey },
  } satisfies MarketplaceWebhookEvent;
}

async function setup(opts: {
  verified: boolean;
  events: MarketplaceWebhookEvent[];
}) {
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
  await store.claims.acquire({
    provider: 'shopee',
    providerStoreId: 'SHP-1',
    workspaceId: WS,
    connectionId: row.id,
    claimedBy: 'user-1',
    claimedAt: new Date('2026-10-01T00:00:00.000Z'),
  });
  const verifyWebhook = vi.fn(() => opts.verified);
  const parseWebhook = vi.fn(() => opts.events);
  const connector = {
    verifyWebhook,
    parseWebhook,
  } as unknown as MarketplaceConnector;
  let seq = 0;
  const deps: IngestWebhookEventDeps = {
    connectorFor: () => connector,
    enabledProviders: ['shopee'],
    claims: store.claims,
    connections: store.connections,
    events: store.events,
    newId: () => `evt-${++seq}`,
  };
  const run = () => ingestWebhookEvent(deps, 'shopee', REQUEST);
  return { store, row, parseWebhook, run };
}

describe('ingest webhook event', () => {
  it('rejects a bad signature and stores nothing', async () => {
    const { store, parseWebhook, run } = await setup({
      verified: false,
      events: [event('d-1', 'SHP-1')],
    });

    await expect(run()).resolves.toEqual({ ack: 'unauthorized' });
    expect(parseWebhook).not.toHaveBeenCalled();
    expect(store.events.events.size).toBe(0);
  });

  it('accepts an event once and counts the redelivery as duplicate', async () => {
    const { store, row, run } = await setup({
      verified: true,
      events: [event('d-1', 'SHP-1')],
    });

    await expect(run()).resolves.toEqual({
      ack: 'ok',
      acceptedEventIds: ['evt-1'],
      duplicates: 0,
    });
    expect(await store.events.find('evt-1')).toMatchObject({
      provider: 'shopee',
      dedupeKey: 'd-1',
      workspaceId: WS,
      connectionId: row.id,
      status: 'received',
    });
    await expect(run()).resolves.toEqual({
      ack: 'ok',
      acceptedEventIds: [],
      duplicates: 1,
    });
    expect(store.events.events.size).toBe(1);
  });

  it('stores events for an unknown store as ignored, not accepted', async () => {
    const { store, run } = await setup({
      verified: true,
      events: [event('d-2', 'SHP-404'), event('d-3', null)],
    });

    await expect(run()).resolves.toEqual({
      ack: 'ok',
      acceptedEventIds: [],
      duplicates: 0,
    });
    expect(await store.events.find('evt-1')).toMatchObject({
      providerStoreId: 'SHP-404',
      workspaceId: null,
      connectionId: null,
      status: 'ignored',
    });
    expect(await store.events.find('evt-2')).toMatchObject({
      providerStoreId: null,
      status: 'ignored',
    });
  });
});
