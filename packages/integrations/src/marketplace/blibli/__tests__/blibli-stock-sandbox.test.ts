import { describe, expect, it } from 'vitest';
import type { MarketplaceConnectorContext } from '@tokoboss/domain';
import { BLIBLI_BASE_URL } from '../blibli-client';
import { createBlibliConnector } from '../blibli-connector';
import { BLIBLI_UPDATE_STOCK_PATH } from '../blibli-stock';

/**
 * Blibli updateStock sandbox tests (UTA-37 / US04, RFC 06 Phase 3 row 54).
 * Partner credentials come only from BLIBLI_CLIENT_ID / BLIBLI_CLIENT_KEY
 * (plus BLIBLI_ENV / BLIBLI_CHANNEL_ID); the fallbacks are fake test values.
 * HTTP is always mocked, so CI stays green with env unset. Live sandbox
 * verification stays deferred until Nico supplies real values.
 */
const env = {
  env: (process.env.BLIBLI_ENV === 'production' ? 'production' : 'uat') as
    'uat' | 'production',
  clientId: process.env.BLIBLI_CLIENT_ID ?? 'test-client-id',
  clientKey: process.env.BLIBLI_CLIENT_KEY ?? 'test-client-key',
  channelId: process.env.BLIBLI_CHANNEL_ID ?? 'tokoboss',
};
const now = new Date('2026-11-09T13:00:00Z');

const ctx: MarketplaceConnectorContext = {
  provider: 'blibli',
  shop: {
    providerStoreId: 'TOS-60001',
    providerAccountId: null,
    shopCipher: null,
    storeName: 'Toko Uji',
    region: 'ID',
  },
  credentials: {
    secrets: { merchantCode: 'TOS-60001', apiSellerKey: 'seller-key-abc' },
    grantedScopes: [],
    accessTokenExpiresAt: null,
    authExpiresAt: null,
  },
};

function connector() {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetchMock = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    calls.push({ url: new URL(String(input)), init: init ?? {} });
    return new Response(JSON.stringify({ success: true, errorCode: null }), {
      status: 200,
    });
  }) as typeof fetch;
  const blibli = createBlibliConnector({
    ...env,
    fetch: fetchMock,
    now: () => now,
    requestId: () => 'req-1',
  });
  return { blibli, calls };
}

describe('Blibli updateStock (sandbox, mocked)', () => {
  it('pushes absolute availableStock per pickupPointCode with env partner auth', async () => {
    const { blibli, calls } = connector();

    const result = await blibli.pushInventory!(ctx, {
      externalItemId: 'TOS-60001-00001',
      platformSkuId: 'TOS-60001-00001-00001',
      targets: [
        { externalLocationId: 'PP-JKT', quantity: 8 },
        { externalLocationId: 'PP-BDG', quantity: 0 },
      ],
    });

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    const headers = new Headers(init.headers);
    const basic = Buffer.from(`${env.clientId}:${env.clientKey}`, 'utf8');
    expect(init.method).toBe('POST');
    expect(url.toString().startsWith(BLIBLI_BASE_URL[env.env])).toBe(true);
    expect(url.pathname.endsWith(BLIBLI_UPDATE_STOCK_PATH)).toBe(true);
    expect(url.searchParams.get('channelId')).toBe(env.channelId);
    expect(url.searchParams.get('merchantCode')).toBe('TOS-60001');
    expect(headers.get('authorization')).toBe(
      `Basic ${basic.toString('base64')}`
    );
    expect(headers.get('api-seller-key')).toBe('seller-key-abc');
    const sku = 'TOS-60001-00001-00001';
    expect(JSON.parse(String(init.body))).toEqual({
      stockList: [
        { gdnSku: sku, availableStock: 8, pickupPointCode: 'PP-JKT' },
        { gdnSku: sku, availableStock: 0, pickupPointCode: 'PP-BDG' },
      ],
    });
    expect(String(init.body)).not.toContain('deltaStock');
    expect(result.pushedQty).toBe(8);
    expect(result.targets.every((t) => t.success)).toBe(true);
  });

  it('omits pickupPointCode for the default location and rejects bad stock', async () => {
    const { blibli, calls } = connector();

    await blibli.pushInventory!(ctx, {
      externalItemId: 'TOS-60001-00002',
      platformSkuId: 'TOS-60001-00002-00001',
      targets: [{ externalLocationId: null, quantity: 3 }],
    });
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      stockList: [{ gdnSku: 'TOS-60001-00002-00001', availableStock: 3 }],
    });

    await expect(
      blibli.pushInventory!(ctx, {
        externalItemId: 'TOS-60001-00002',
        platformSkuId: 'TOS-60001-00002-00001',
        targets: [{ externalLocationId: 'PP-JKT', quantity: -1 }],
      })
    ).rejects.toThrow('BLIBLI_STOCK_INVALID');
    expect(calls).toHaveLength(1);
  });
});
