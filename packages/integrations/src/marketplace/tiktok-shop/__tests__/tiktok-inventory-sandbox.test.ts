import { describe, expect, it } from 'vitest';
import {
  MarketplaceConnectorError,
  type MarketplaceConnectorContext,
} from '@tokoboss/domain';
import { createTikTokConnector } from '../tiktok-connector';
import { TikTokSigner } from '../tiktok-signer';

/**
 * TikTok Shop inventory update sandbox tests (UTA-37 / US04, RFC 06 Phase 3
 * row 53). App credentials come only from TIKTOK_SHOP_APP_KEY /
 * TIKTOK_SHOP_APP_SECRET; the fallbacks are fake test values. HTTP is always
 * mocked, so CI stays green with env unset. Live sandbox verification stays
 * deferred until Nico supplies real values.
 */
const env = {
  appKey: process.env.TIKTOK_SHOP_APP_KEY ?? 'test-app-key',
  appSecret: process.env.TIKTOK_SHOP_APP_SECRET ?? 'test-app-secret',
  serviceId: process.env.TIKTOK_SHOP_SERVICE_ID ?? 'test-service',
  host: 'https://open-api.tiktok.test',
  authHost: 'https://auth.tiktok.test',
  authorizeHost: 'https://services.tiktok.test',
  webhookAddress: 'https://tokoboss.example/api/webhooks/tiktok',
};
const now = new Date('2026-11-09T13:00:00Z');
const PATH = '/product/202309/products/1729/inventory/update';

const ctx: MarketplaceConnectorContext = {
  provider: 'tiktok_shop',
  shop: {
    providerStoreId: '7495',
    providerAccountId: 'seller-1',
    shopCipher: 'cipher-abc',
    storeName: 'Toko Uji',
    region: 'ID',
  },
  credentials: {
    secrets: { access_token: 'shop-access', refresh_token: 'shop-refresh' },
    grantedScopes: [],
    accessTokenExpiresAt: new Date(now.getTime() + 3_600_000),
    authExpiresAt: null,
  },
};

function connector(data: Record<string, unknown>) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetchMock = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    calls.push({ url: new URL(String(input)), init: init ?? {} });
    return new Response(JSON.stringify({ code: 0, message: 'ok', data }), {
      status: 200,
    });
  }) as typeof fetch;
  const tiktok = createTikTokConnector({
    ...env,
    fetch: fetchMock,
    now: () => now,
  });
  return { tiktok, calls };
}

describe('TikTok Shop inventory update (sandbox, mocked)', () => {
  it('pushes absolute stock per warehouse_id with env app credentials', async () => {
    const { tiktok, calls } = connector({});

    const result = await tiktok.pushInventory!(ctx, {
      externalItemId: '1729',
      platformSkuId: 'sku-42',
      targets: [
        { externalLocationId: 'WH-JKT', quantity: 5 },
        { externalLocationId: 'WH-SBY', quantity: 2 },
      ],
    });

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    const body = String(init.body);
    expect(init.method).toBe('POST');
    expect(url.pathname).toBe(PATH);
    expect(url.searchParams.get('app_key')).toBe(env.appKey);
    expect(url.searchParams.get('shop_cipher')).toBe('cipher-abc');
    expect(new Headers(init.headers).get('x-tts-access-token')).toBe(
      'shop-access'
    );
    const query = Object.fromEntries(url.searchParams);
    delete query.sign;
    expect(url.searchParams.get('sign')).toBe(
      new TikTokSigner(env).sign(PATH, query, body)
    );
    expect(JSON.parse(body)).toEqual({
      skus: [
        {
          id: 'sku-42',
          inventory: [
            { warehouse_id: 'WH-JKT', available_stock: 5 },
            { warehouse_id: 'WH-SBY', available_stock: 2 },
          ],
        },
      ],
    });
    expect(result.pushedQty).toBe(7);
    expect(result.targets.every((t) => t.success)).toBe(true);
  });

  it('rejects a missing warehouse before calling and fails on data.errors', async () => {
    const empty = connector({});
    await expect(
      empty.tiktok.pushInventory!(ctx, {
        externalItemId: '1729',
        platformSkuId: 'sku-42',
        targets: [{ externalLocationId: null, quantity: 5 }],
      })
    ).rejects.toThrow('TIKTOK_WAREHOUSE_REQUIRED');
    expect(empty.calls).toHaveLength(0);

    const rejected = connector({ errors: [{ code: 12052048 }] });
    const failure = await rejected.tiktok.pushInventory!(ctx, {
      externalItemId: '1729',
      platformSkuId: 'sku-42',
      targets: [{ externalLocationId: 'WH-JKT', quantity: 5 }],
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(MarketplaceConnectorError);
    expect((failure as MarketplaceConnectorError).message).toBe(
      'TIKTOK_INVENTORY_REJECTED'
    );
  });
});
