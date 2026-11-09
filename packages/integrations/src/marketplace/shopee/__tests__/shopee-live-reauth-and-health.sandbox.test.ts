import { describe, expect, it } from 'vitest';
import {
  MarketplaceConnectorError,
  assertMarketplaceTransition,
  evaluateConnectionHealth,
  type MarketplaceConnectorContext,
} from '@tokoboss/domain';
import { createShopeeConnector } from '../shopee-connector';
import { ShopeeSigner } from '../shopee-signer';

/**
 * Shopee reauth / health sandbox tests (UTA-38 / US18, RFC 07 Phase G
 * row 40). Partner credentials come only from SHOPEE_PARTNER_ID /
 * SHOPEE_PARTNER_KEY (optional SHOPEE_API_HOST); the fallbacks are fake
 * test values. HTTP is always mocked, so CI stays green with env unset.
 * Live sandbox verification stays deferred until Nico supplies real values.
 */
const env = {
  partnerId: Number(process.env.SHOPEE_PARTNER_ID ?? '2001234'),
  partnerKey: process.env.SHOPEE_PARTNER_KEY ?? 'test-partner-key',
  host: process.env.SHOPEE_API_HOST ?? 'https://sandbox.shopee.test',
};
const now = new Date('2026-11-09T13:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const REFRESH_PATH = '/api/v2/auth/access_token/get';

function ctx(authExpiresAt: Date): MarketplaceConnectorContext {
  return {
    provider: 'shopee',
    shop: {
      providerStoreId: '555',
      providerAccountId: null,
      shopCipher: null,
      storeName: 'Toko Uji',
      region: 'ID',
    },
    credentials: {
      secrets: { access_token: 'old-access', refresh_token: 'old-refresh' },
      grantedScopes: [],
      accessTokenExpiresAt: now,
      authExpiresAt,
    },
  };
}

function connector(status: number, json: Record<string, unknown>) {
  const calls: { url: URL; body: Record<string, unknown> }[] = [];
  const fetchMock = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    calls.push({
      url: new URL(String(input)),
      body: JSON.parse(String(init?.body ?? '{}')),
    });
    return new Response(JSON.stringify(json), { status });
  }) as typeof fetch;
  const shopee = createShopeeConnector({
    ...env,
    fetch: fetchMock,
    now: () => now,
  });
  return { shopee, calls };
}

describe('Shopee reauth and health (sandbox, mocked)', () => {
  it('rotates tokens on the ~30-day refresh path with env partner config', async () => {
    const authExpiresAt = new Date(now.getTime() + 30 * DAY_MS);
    const { shopee, calls } = connector(200, {
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expire_in: 14400,
    });

    const next = await shopee.refresh(ctx(authExpiresAt));

    expect(calls).toHaveLength(1);
    const { url, body } = calls[0]!;
    expect(url.pathname).toBe(REFRESH_PATH);
    expect(url.searchParams.get('partner_id')).toBe(String(env.partnerId));
    expect(url.searchParams.get('sign')).toBe(
      new ShopeeSigner(env).sign(REFRESH_PATH, now, { kind: 'public' })
    );
    expect(body).toEqual({
      refresh_token: 'old-refresh',
      partner_id: env.partnerId,
      shop_id: 555,
    });
    expect(next.secrets).toEqual({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
    });
    expect(next.accessTokenExpiresAt).toEqual(
      new Date(now.getTime() + 14400 * 1000)
    );
    expect(next.authExpiresAt).toEqual(authExpiresAt);
  });

  it('maps revoked permission to auth_invalid and needs_reauth health', async () => {
    const { shopee } = connector(403, { error: 'error_permission' });

    const failure = await shopee
      .refresh(ctx(new Date(now.getTime() + 10 * DAY_MS)))
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(MarketplaceConnectorError);
    expect((failure as MarketplaceConnectorError).kind).toBe('auth_invalid');
    expect(() =>
      assertMarketplaceTransition('connected', 'needs_reauth')
    ).not.toThrow();
    const health = {
      orderImportEnabled: true,
      inventorySyncEnabled: true,
      missingPermissions: [],
      authExpiresAt: new Date(now.getTime() + 10 * DAY_MS),
    };
    expect(
      evaluateConnectionHealth({ ...health, status: 'needs_reauth' }, now)
    ).toBe('needs_reauth');
    expect(
      evaluateConnectionHealth({ ...health, status: 'connected' }, now)
    ).toBe('healthy');
  });
});
