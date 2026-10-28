import type {
  MarketplaceConnectorContext,
  MarketplaceProvider,
  MarketplaceStockPushInput,
} from '@tokoboss/domain';
import { describe, expect, it } from 'vitest';
import { createBlibliConnector } from '../blibli/blibli-connector';
import { createFakeMarketplaceConnector } from '../fake/fake-marketplace-connector';
import { createShopeeConnector } from '../shopee/shopee-connector';
import { createTikTokConnector } from '../tiktok-shop/tiktok-connector';

/**
 * `pushInventory` across the wired connectors (UTA-37 / US04, RFC 06 task
 * 14): Shopee `update_stock` + `failure_list`, TikTok Shop
 * `inventory/update` + the missing-warehouse guard, Blibli absolute
 * `availableStock` and the fixture fake. Fetch is mocked; no network.
 */
const now = () => new Date(1_760_000_000_000);
type Call = { readonly url: string; readonly body: unknown };

function mockFetch(responses: unknown[], calls: Call[]): typeof fetch {
  return (async (url: URL | string, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(responses.shift() ?? {}));
  }) as unknown as typeof fetch;
}

function ctx(
  provider: MarketplaceProvider,
  providerStoreId: string,
  secrets: Record<string, string>
): MarketplaceConnectorContext {
  return {
    provider,
    shop: {
      providerStoreId,
      providerAccountId: null,
      shopCipher: 'CIPH',
      storeName: null,
      region: null,
    },
    credentials: {
      secrets,
      grantedScopes: [],
      accessTokenExpiresAt: null,
      authExpiresAt: null,
    },
  };
}

/** `[locationId, quantity]` pairs → one push input. */
function stock(
  externalItemId: string,
  platformSkuId: string,
  ...pairs: [string | null, number][]
): MarketplaceStockPushInput {
  const targets = pairs.map(([externalLocationId, quantity]) => ({
    externalLocationId,
    quantity,
  }));
  return { externalItemId, platformSkuId, targets };
}

describe('marketplace stock push', () => {
  it('Shopee posts absolute seller_stock and fails on failure_list', async () => {
    const calls: Call[] = [];
    const responses = [
      { response: { success_list: [{ model_id: 456 }] } },
      { response: { failure_list: [{ model_id: 456, failed_reason: 'x' }] } },
    ];
    const connector = createShopeeConnector({
      partnerId: 1001,
      partnerKey: 'partner-key',
      host: 'https://partner.example.com',
      fetch: mockFetch(responses, calls),
      now,
    });
    const shop = ctx('shopee', '777', { access_token: 'tok' });
    const input = stock('123', '123:456', ['ID1', 4], [null, 2]);
    const result = await connector.pushInventory!(shop, input);
    expect(result.pushedQty).toBe(6);
    expect(result.targets.map((t) => t.success)).toEqual([true, true]);
    expect(calls[0]!.url).toContain('/api/v2/product/update_stock?');
    expect(calls[0]!.body).toEqual({
      item_id: 123,
      stock_list: [
        {
          model_id: 456,
          seller_stock: [{ location_id: 'ID1', stock: 4 }, { stock: 2 }],
        },
      ],
    });
    await expect(connector.pushInventory!(shop, input)).rejects.toMatchObject({
      kind: 'bad_request',
      message: 'SHOPEE_STOCK_FAILED',
    });
  });

  it('TikTok Shop updates per warehouse and requires a warehouse', async () => {
    const calls: Call[] = [];
    const connector = createTikTokConnector({
      appKey: 'app-key',
      appSecret: 'app-secret',
      serviceId: 'svc',
      host: 'https://open-api.example.com',
      authHost: 'https://auth.example.com',
      authorizeHost: 'https://services.example.com',
      webhookAddress: 'https://tokoboss.example.com/api/webhooks/tiktok',
      fetch: mockFetch([{ code: 0, message: 'ok', data: {} }], calls),
      now,
    });
    const shop = ctx('tiktok_shop', 's1', { access_token: 'tok' });
    const input = stock('P1', 'S1', ['W1', 3], ['W2', 0]);
    expect((await connector.pushInventory!(shop, input)).pushedQty).toBe(3);
    expect(calls[0]!.url).toContain('/product/202309/products/P1/inventory');
    expect(calls[0]!.url).toContain('shop_cipher=CIPH');
    expect(calls[0]!.body).toEqual({
      skus: [
        {
          id: 'S1',
          inventory: [
            { warehouse_id: 'W1', available_stock: 3 },
            { warehouse_id: 'W2', available_stock: 0 },
          ],
        },
      ],
    });
    const noWarehouse = stock('P1', 'S1', [null, 1]);
    await expect(
      connector.pushInventory!(shop, noWarehouse)
    ).rejects.toMatchObject({
      kind: 'bad_request',
      message: 'TIKTOK_WAREHOUSE_REQUIRED',
    });
    expect(calls).toHaveLength(1);
  });

  it('Blibli sends availableStock and the fake records the push', async () => {
    const calls: Call[] = [];
    const blibli = createBlibliConnector({
      env: 'uat',
      clientId: 'tb-client',
      clientKey: 'tb-secret',
      channelId: 'tokoboss',
      fetch: mockFetch([{ success: true }], calls),
      now,
      requestId: () => 'req-1',
    });
    const keys = { apiSellerKey: 'seller-key', signatureKey: 'sig-key' };
    const shop = ctx('blibli', 'TOS-60001', keys);
    const gdnSku = 'TOS-60001-0001-00001';
    const input = stock('TOS-60001-0001', gdnSku, ['PP-1', 4], [null, 1]);
    expect((await blibli.pushInventory!(shop, input)).pushedQty).toBe(5);
    expect(calls[0]!.url).toContain('/v1/product/updateStock');
    expect(calls[0]!.body).toEqual({
      stockList: [
        { gdnSku, availableStock: 4, pickupPointCode: 'PP-1' },
        { gdnSku, availableStock: 1 },
      ],
    });
    expect(JSON.stringify(calls[0]!.body)).not.toContain('deltaStock');

    const fakeCtx = ctx('shopee', '1', {});
    const listing = {
      externalItemId: 'F1',
      platformSkuId: 'F1-A',
      storeSkuText: 'SKU-A',
      barcodeHint: null,
      title: 'Kaos',
      variantName: null,
      listingStatus: 'active',
      providerStock: 9,
    };
    const fake = createFakeMarketplaceConnector({
      provider: 'shopee',
      shops: [fakeCtx.shop],
      credentials: fakeCtx.credentials,
      listingPages: [[listing]],
    });
    const fakeInput = stock('F1', 'F1-A', [null, 2]);
    expect((await fake.pushInventory(fakeCtx, fakeInput)).pushedQty).toBe(2);
    expect(fake.pushedInventory).toEqual([fakeInput]);
    const page = await fake.listListingsPage(fakeCtx, null);
    expect(page.rows[0]!.providerStock).toBe(2);
  });
});
