import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InMemoryIntegrationStore } from '@tokoboss/application';
import {
  __resetIntegrationsForTests,
  getIntegrationStore,
} from '../lib/integrations';
import { POST as webhook } from '../app/api/webhooks/[provider]/route';

/**
 * US20 / RFC 04 task 99: webhook route status codes. A bad or missing
 * signature is an empty 401 with nothing stored; a duplicate delivery is
 * acked 200 and deduped; an event for an unclaimed store is acked 200 and
 * kept as `ignored` with no workspace. A disabled provider is a 404.
 */

const APP_KEY = 'tiktok-test-app-key';
const APP_SECRET = 'tiktok-test-app-secret';

function sign(rawBody: string): string {
  return createHmac('sha256', APP_SECRET)
    .update(`${APP_KEY}${rawBody}`, 'utf8')
    .digest('hex');
}

function notification(id: string, shopId: string): string {
  return JSON.stringify({
    type: 6,
    tts_notification_id: id,
    shop_id: shopId,
    timestamp: 1761200000,
    data: { reason: 'test' },
  });
}

function post(provider: string, rawBody: string, authorization?: string) {
  return webhook(
    new Request(`http://localhost/api/webhooks/${provider}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(authorization ? { authorization } : {}),
      },
      body: rawBody,
    }),
    { params: Promise.resolve({ provider }) }
  );
}

function storedEvents() {
  const store = getIntegrationStore() as unknown as InMemoryIntegrationStore;
  return [...store.events.events.values()];
}

describe('POST /api/webhooks/[provider] (task 99)', () => {
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

  it('rejects a bad or missing signature with an empty 401', async () => {
    const body = notification('n-401', 'shop-401');
    const forged = await post('tiktok_shop', body, sign(`${body} `));
    expect(forged.status).toBe(401);
    expect(await forged.text()).toBe('');
    const unsigned = await post('tiktok_shop', body);
    expect(unsigned.status).toBe(401);
    expect(storedEvents()).toHaveLength(0);
    const disabled = await post('shopee', body, sign(body));
    expect(disabled.status).toBe(404);
  });

  it('acks a duplicate delivery with 200 and stores it once', async () => {
    const body = notification('n-dup', 'shop-dup');
    const first = await post('tiktok_shop', body, sign(body));
    expect(first.status).toBe(200);
    expect(await first.text()).toBe('');
    const again = await post('tiktok_shop', body, sign(body));
    expect(again.status).toBe(200);
    expect(await again.text()).toBe('');
    const events = storedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.dedupeKey).toBe('tiktok:n-dup');
  });

  it('acks an unknown store with 200 and keeps the event ignored', async () => {
    const body = notification('n-unknown', 'shop-nobody-claimed');
    const res = await post('tiktok_shop', body, sign(body));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
    const events = storedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      provider: 'tiktok_shop',
      eventType: 'SELLER_DEAUTHORIZATION',
      providerStoreId: 'shop-nobody-claimed',
      status: 'ignored',
      connectionId: null,
      workspaceId: null,
    });
  });
});
