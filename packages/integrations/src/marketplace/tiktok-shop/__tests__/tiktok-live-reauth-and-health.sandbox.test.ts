import { describe, expect, it } from 'vitest';
import {
  MarketplaceConnectorError,
  assertMarketplaceTransition,
  evaluateConnectionHealth,
  type MarketplaceConnectorContext,
} from '@tokoboss/domain';
import { createTikTokConnector } from '../tiktok-connector';

/**
 * TikTok Shop reauth / health sandbox tests (UTA-38 / US18, RFC 07 Phase G
 * row 41). App credentials come only from TIKTOK_SHOP_APP_KEY /
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
const DAY_MS = 24 * 60 * 60 * 1000;
const unix = (date: Date) => Math.floor(date.getTime() / 1000);

function ctx(authExpiresAt: Date): MarketplaceConnectorContext {
  return {
    provider: 'tiktok_shop',
    shop: {
      providerStoreId: '7495',
      providerAccountId: 'seller-1',
      shopCipher: 'cipher-abc',
      storeName: 'Toko Uji',
      region: 'ID',
    },
    credentials: {
      secrets: { access_token: 'old-access', refresh_token: 'old-refresh' },
      grantedScopes: ['seller.product.basic'],
      accessTokenExpiresAt: now,
      authExpiresAt,
    },
  };
}

function connector(status: number, json: Record<string, unknown>) {
  const urls: URL[] = [];
  const fetchMock = (async (input: string | URL | Request) => {
    urls.push(new URL(String(input)));
    return new Response(JSON.stringify(json), { status });
  }) as typeof fetch;
  const tiktok = createTikTokConnector({
    ...env,
    fetch: fetchMock,
    now: () => now,
  });
  return { tiktok, urls };
}

describe('TikTok Shop reauth and health (sandbox, mocked)', () => {
  it('refreshes lazily with env app credentials and rotates both tokens', async () => {
    const accessUntil = new Date(now.getTime() + DAY_MS);
    const authUntil = new Date(now.getTime() + 30 * DAY_MS);
    const { tiktok, urls } = connector(200, {
      code: 0,
      data: {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        access_token_expire_in: unix(accessUntil),
        refresh_token_expire_in: unix(authUntil),
      },
    });

    const next = await tiktok.refresh(ctx(new Date(now.getTime() + DAY_MS)));

    expect(urls).toHaveLength(1);
    const url = urls[0]!;
    expect(url.origin).toBe(env.authHost);
    expect(url.pathname).toBe('/api/v2/token/refresh');
    expect(url.searchParams.get('app_key')).toBe(env.appKey);
    expect(url.searchParams.get('app_secret')).toBe(env.appSecret);
    expect(url.searchParams.get('grant_type')).toBe('refresh_token');
    expect(url.searchParams.get('refresh_token')).toBe('old-refresh');
    expect(next.secrets).toEqual({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
    });
    expect(next.grantedScopes).toEqual(['seller.product.basic']);
    expect(next.accessTokenExpiresAt).toEqual(accessUntil);
    expect(next.authExpiresAt).toEqual(authUntil);
  });

  it('maps a revoked grant to needs_reauth and paused sync to paused_partial', async () => {
    const { tiktok } = connector(401, {
      code: 105002,
      message: 'Access token is invalid',
    });

    const failure = await tiktok
      .refresh(ctx(new Date(now.getTime() + 10 * DAY_MS)))
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(MarketplaceConnectorError);
    expect((failure as MarketplaceConnectorError).kind).toBe('auth_invalid');
    expect(() =>
      assertMarketplaceTransition('connected', 'needs_reauth')
    ).not.toThrow();
    const health = {
      status: 'connected' as const,
      orderImportEnabled: true,
      inventorySyncEnabled: true,
      missingPermissions: [],
      authExpiresAt: new Date(now.getTime() + 10 * DAY_MS),
    };
    const status = 'needs_reauth' as const;
    expect(evaluateConnectionHealth({ ...health, status }, now)).toBe(status);
    const paused = { ...health, inventorySyncEnabled: false };
    expect(evaluateConnectionHealth(paused, now)).toBe('paused_partial');
    expect(evaluateConnectionHealth(health, now)).toBe('healthy');
  });
});
