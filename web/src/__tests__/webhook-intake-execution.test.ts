import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InMemoryIntegrationStore } from '@tokoboss/application';
import {
  __resetIntegrationsForTests,
  getIntegrationStore,
} from '../lib/integrations';
import { runInboundEventJobs } from '../lib/integration-jobs';
import { getJobStore } from '../lib/jobs';
import { POST as webhook } from '../app/api/webhooks/[provider]/route';

/**
 * US20 / RFC 04 task 145b: webhook intake runs each new
 * `marketplace.inbound_event` job on intake (task 144, no crons). A signed
 * TikTok Shop seller deauthorization for a claimed store is processed in
 * the same request (job completed, event processed, connection
 * disconnected); a duplicate delivery is acked 200 but never re-run.
 */

const APP_KEY = 'tiktok-test-app-key';
const APP_SECRET = 'tiktok-test-app-secret';
const WORKSPACE = 'ws-145b';
const SHOP = 'shop-145b';

function sign(rawBody: string): string {
  return createHmac('sha256', APP_SECRET)
    .update(`${APP_KEY}${rawBody}`, 'utf8')
    .digest('hex');
}

function deauthorization(id: string): string {
  return JSON.stringify({
    type: 6,
    tts_notification_id: id,
    shop_id: SHOP,
    timestamp: 1761200000,
    data: { reason: 'seller revoked' },
  });
}

function post(rawBody: string) {
  return webhook(
    new Request('http://localhost/api/webhooks/tiktok_shop', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: sign(rawBody),
      },
      body: rawBody,
    }),
    { params: Promise.resolve({ provider: 'tiktok_shop' }) }
  );
}

function store() {
  return getIntegrationStore() as unknown as InMemoryIntegrationStore;
}

/** A connected TikTok Shop store claimed by WORKSPACE. */
async function seedClaimedConnection(): Promise<string> {
  const now = new Date();
  const row = await store().connections.upsert({
    workspaceId: WORKSPACE,
    provider: 'tiktok_shop',
    connectMode: 'oauth_redirect',
    shop: {
      providerStoreId: SHOP,
      providerAccountId: null,
      shopCipher: 'cipher-145b',
      storeName: 'Toko 145b',
      region: 'ID',
    },
    grantedScopes: [],
    accessTokenExpiresAt: null,
    authExpiresAt: null,
    connectedBy: 'user-145b',
    connectedAt: now,
  });
  await store().claims.acquire({
    provider: 'tiktok_shop',
    providerStoreId: SHOP,
    workspaceId: WORKSPACE,
    connectionId: row.id,
    claimedBy: 'user-145b',
    claimedAt: now,
  });
  return row.id;
}

function storedEvents() {
  return [...store().events.events.values()];
}

describe('webhook intake executes inbound-event jobs (task 145b)', () => {
  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('MARKETPLACE_PROVIDERS_ENABLED', 'tiktok_shop');
    vi.stubEnv('TIKTOK_SHOP_APP_KEY', APP_KEY);
    vi.stubEnv('TIKTOK_SHOP_APP_SECRET', APP_SECRET);
    vi.stubEnv('TIKTOK_SHOP_SERVICE_ID', 'svc-test');
    vi.stubEnv('TIKTOK_SHOP_API_HOST', 'https://open-api.tiktokglobalshop.com');
    vi.stubEnv('TIKTOK_SHOP_AUTH_HOST', 'https://auth.tiktok-shops.com');
    vi.stubEnv('TIKTOK_SHOP_AUTHORIZE_HOST', 'https://services.tiktokshop.com');
    __resetIntegrationsForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __resetIntegrationsForTests();
  });

  it('runs the inbound-event job on intake and disconnects the store', async () => {
    const connectionId = await seedClaimedConnection();
    const res = await post(deauthorization('n-145b-run'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
    const [event] = storedEvents();
    expect(event).toMatchObject({
      workspaceId: WORKSPACE,
      connectionId,
      status: 'processed',
      attempts: 1,
    });
    const job = await getJobStore().findByIdempotencyKey(
      WORKSPACE,
      `marketplace.inbound_event:${event?.id}`
    );
    expect(job?.status).toBe('completed');
    const row = await store().connections.find(WORKSPACE, connectionId);
    expect(row).toMatchObject({
      status: 'disconnected',
      disconnectSource: 'seller',
    });
  });

  it('acks a duplicate delivery with 200 and does not re-run it', async () => {
    const connectionId = await seedClaimedConnection();
    const body = deauthorization('n-145b-dup');
    expect((await post(body)).status).toBe(200);
    const after = await store().connections.find(WORKSPACE, connectionId);
    const again = await post(body);
    expect(again.status).toBe(200);
    expect(await again.text()).toBe('');
    const events = storedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: 'processed', attempts: 1 });
    const row = await store().connections.find(WORKSPACE, connectionId);
    expect(row?.version).toBe(after?.version);
    const rerun = await runInboundEventJobs([events[0]?.id ?? '']);
    expect(rerun).toMatchObject({ jobIds: [], executed: 0 });
    expect(storedEvents()[0]?.attempts).toBe(1);
  });
});
