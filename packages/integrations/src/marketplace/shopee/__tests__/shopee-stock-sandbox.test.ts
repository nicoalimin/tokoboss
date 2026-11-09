import { describe, expect, it } from 'vitest';
import type {
  MarketplaceConnectorContext,
  MarketplaceStockPushInput,
} from '@tokoboss/domain';
import { createShopeeConnector } from '../shopee-connector';
import { ShopeeSigner } from '../shopee-signer';

/**
 * Shopee update_stock sandbox tests (UTA-37 / US04, RFC 06 Phase 3 row 52).
 * Partner credentials come only from SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY
 * (optional SHOPEE_API_HOST); the fallbacks are fake test values. HTTP is
 * always mocked, so CI stays green with env unset. Live sandbox
 * verification stays deferred until Nico supplies real values.
 */
const env = {
  partnerId: Number(process.env.SHOPEE_PARTNER_ID ?? '2001234'),
  partnerKey: process.env.SHOPEE_PARTNER_KEY ?? 'test-partner-key',
  host: process.env.SHOPEE_API_HOST ?? 'https://sandbox.shopee.test',
};
const now = new Date('2026-11-09T13:00:00Z');
const PATH = '/api/v2/product/update_stock';

const ctx: MarketplaceConnectorContext = {
  provider: 'shopee',
  shop: {
    providerStoreId: '555',
    providerAccountId: null,
    shopCipher: null,
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

async function push(input: MarketplaceStockPushInput) {
  const calls: { url: URL; body: Record<string, unknown> }[] = [];
  const fetchMock = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    calls.push({
      url: new URL(String(input)),
      body: JSON.parse(String(init?.body ?? '{}')),
    });
    const response = { failure_list: [], success_list: [] };
    return new Response(JSON.stringify({ error: '', response }), {
      status: 200,
    });
  }) as typeof fetch;
  const shopee = createShopeeConnector({
    ...env,
    fetch: fetchMock,
    now: () => now,
  });
  const result = await shopee.pushInventory!(ctx, input);
  expect(calls).toHaveLength(1);
  const { url, body } = calls[0]!;
  expect(url.pathname).toBe(PATH);
  expect(url.searchParams.get('partner_id')).toBe(String(env.partnerId));
  expect(url.searchParams.get('shop_id')).toBe('555');
  expect(url.searchParams.get('sign')).toBe(
    new ShopeeSigner(env).sign(PATH, now, {
      kind: 'shop',
      accessToken: 'shop-access',
      shopId: 555,
    })
  );
  return { result, body };
}

describe('Shopee update_stock (sandbox, mocked)', () => {
  it('pushes a single item with model_id 0', async () => {
    const { result, body } = await push({
      externalItemId: '1001',
      platformSkuId: '1001',
      targets: [{ externalLocationId: null, quantity: 7 }],
    });
    expect(body).toEqual({
      item_id: 1001,
      stock_list: [{ model_id: 0, seller_stock: [{ stock: 7 }] }],
    });
    expect(result.pushedQty).toBe(7);
  });

  it('pushes one variation with its model_id', async () => {
    const { result, body } = await push({
      externalItemId: '1001',
      platformSkuId: '1001:2002',
      targets: [{ externalLocationId: null, quantity: 3 }],
    });
    expect(body).toEqual({
      item_id: 1001,
      stock_list: [{ model_id: 2002, seller_stock: [{ stock: 3 }] }],
    });
    expect(result.targets[0]?.success).toBe(true);
  });

  it('pushes absolute stock per warehouse location_id', async () => {
    const { result, body } = await push({
      externalItemId: '1001',
      platformSkuId: '1001:2002',
      targets: [
        { externalLocationId: 'IDZ', quantity: 4 },
        { externalLocationId: 'IDW', quantity: 6 },
      ],
    });
    expect(body).toEqual({
      item_id: 1001,
      stock_list: [
        {
          model_id: 2002,
          seller_stock: [
            { location_id: 'IDZ', stock: 4 },
            { location_id: 'IDW', stock: 6 },
          ],
        },
      ],
    });
    expect(result.pushedQty).toBe(10);
    expect(result.targets.every((t) => t.success)).toBe(true);
  });
});
