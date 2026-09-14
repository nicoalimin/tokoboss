import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../api/client';

const HEALTH = {
  status: 'ok',
  service: 'web',
  env: 'local',
  timestamp: '2026-09-14T00:00:00.000Z',
  deploymentId: null,
  requestId: 'req_test',
  correlationId: 'corr_test',
};

const TOKENS = {
  accessToken: 'access-123',
  refreshToken: 'refresh-123',
  expiresAt: '2027-09-14T00:00:00.000Z',
  userId: 'user-1',
};

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  return vi.fn(async (url: string, init?: RequestInit) => ({
    status: 200,
    json: async () => handler(url, init),
  }));
}

describe('api client', () => {
  it('validates a mocked health response through shared contracts', async () => {
    const fetchImpl = stubFetch(() => HEALTH);
    const client = createApiClient({
      baseUrl: 'http://localhost:3000',
      getAccessToken: async () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.getHealth()).resolves.toMatchObject({
      status: 'ok',
      service: 'web',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('sends the bearer token and validates the session payload', async () => {
    const seen: Record<string, string>[] = [];
    const fetchImpl = stubFetch((url, init) => {
      seen.push({ ...(init?.headers as Record<string, string>) });
      expect(url).toBe('http://localhost:3000/api/v1/session');
      return {
        success: true,
        data: TOKENS,
        meta: { timestamp: HEALTH.timestamp },
      };
    });
    const events: unknown[] = [];
    const client = createApiClient({
      baseUrl: 'http://localhost:3000/',
      getAccessToken: async () => TOKENS.accessToken,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onEvent: (e) => events.push(e),
    });
    await expect(client.getSession()).resolves.toMatchObject({
      userId: 'user-1',
    });
    expect(seen[0]?.['authorization']).toBe(`Bearer ${TOKENS.accessToken}`);
    // Observability hook must never carry token material.
    expect(JSON.stringify(events)).not.toContain(TOKENS.accessToken);
    expect(JSON.stringify(events)).not.toContain(TOKENS.refreshToken);
  });

  it('refuses unversioned routes before touching the network', async () => {
    const { versionedPath } = await import('@tokoboss/contracts');
    // The exact guard `createApiClient` applies to every request:
    // unversioned BFF paths, action names, and absolute URLs throw.
    expect(() => versionedPath('/api/health')).toThrow();
    expect(() => versionedPath('getInventory')).toThrow();
    expect(() => versionedPath('https://evil.test/api/v1/session')).toThrow();
    expect(versionedPath('/api/v1/session')).toBe('/api/v1/session');

    // …and the client only ever fetches versioned paths.
    const seenUrls: string[] = [];
    const fetchImpl = stubFetch((url) => {
      seenUrls.push(url);
      return HEALTH;
    });
    const client = createApiClient({
      baseUrl: 'http://localhost:3000',
      getAccessToken: async () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.getHealth();
    expect(seenUrls).toHaveLength(1);
    expect(seenUrls[0]?.startsWith('http://localhost:3000/api/v1/')).toBe(true);
  });

  it('refreshes once on 401 and retries the request', async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return { status: 401, json: async () => null };
      return {
        status: 200,
        json: async () => ({
          success: true,
          data: TOKENS,
          meta: { timestamp: HEALTH.timestamp },
        }),
      };
    });
    const client = createApiClient({
      baseUrl: 'http://localhost:3000',
      getAccessToken: async () => 'expired-token',
      onUnauthorized: async () => 'fresh-token',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.getSession()).resolves.toMatchObject({
      userId: 'user-1',
    });
    expect(calls).toBe(2);
  });

  it('throws VALIDATION_ERROR when the BFF breaks shared contracts', async () => {
    const fetchImpl = stubFetch(() => ({ status: 'ok', service: 42 }));
    const client = createApiClient({
      baseUrl: 'http://localhost:3000',
      getAccessToken: async () => null,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.getHealth()).rejects.toMatchObject({
      name: 'ApiError',
      code: 'VALIDATION_ERROR',
    });
  });
});
