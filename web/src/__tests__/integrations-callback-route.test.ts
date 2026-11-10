import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InMemoryIntegrationStore } from '@tokoboss/application';
import { __resetAuthForTests, seedFixtureCredential } from '../lib/auth';
import { __resetMembershipForTests } from '../lib/membership';
import {
  __resetIntegrationsForTests,
  getIntegrationStore,
} from '../lib/integrations';
import { POST as signIn } from '../app/api/auth/sign-in/route';
import { POST as connect } from '../app/api/workspaces/[workspaceId]/integrations/route';
import { GET as callback } from '../app/api/integrations/[provider]/callback/route';

/**
 * US20 / RFC 04 row 98 (split 98a): the OAuth callback route (93b) with
 * Shopee enabled from env (dummy partner values, never real) and a stubbed
 * fetch. A replayed state is a 410 and an unknown provider a 404 (JSON, no
 * redirect); a store claimed elsewhere redirects to the connect page with
 * `result=blocked` and nothing about the other workspace; a connect
 * redirects to the store page with `result=connected` and queues the
 * first import.
 */

const ADMIN = { email: 'owner@fixture.test', password: 'sari-roti-88!' };
const OTHER = { email: 'other@fixture.test', password: 'lain-toko-55!' };
const OWNER_NAME = 'Toko Pemilik Rahasia';
const SHOP_ID = '98001';

const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
  const url = String(args[0]);
  if (url.includes('/auth/token/get')) {
    const tokens = { access_token: 'at-98a', refresh_token: 'rt-98a' };
    return Response.json({ ...tokens, expire_in: 14400 });
  }
  if (url.includes('/shop/get_shop_info')) {
    return Response.json({ shop_name: 'Toko Sari', region: 'ID' });
  }
  return Response.json({ error: 'error_server' }, { status: 503 });
});

function post(path: string, body: unknown, token?: string): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function signInToken(
  who: { email: string; password: string },
  workspaceId: string
): Promise<string> {
  const auth = { ...who, workspaceId, platform: 'mobile' };
  const res = await signIn(post('/api/auth/sign-in', auth));
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

/** POST /integrations {provider: shopee} -> the state on the redirect. */
async function startState(workspaceId: string, token: string) {
  const path = `/api/workspaces/${workspaceId}/integrations`;
  const res = await connect(post(path, { provider: 'shopee' }, token), {
    params: Promise.resolve({ workspaceId }),
  });
  expect(res.status).toBe(200);
  const { authorizeUrl } = (await res.json()) as { authorizeUrl: string };
  const redirect = new URL(authorizeUrl).searchParams.get('redirect') ?? '';
  return new URL(redirect).searchParams.get('state') ?? '';
}

function callbackGet(
  provider: string,
  query: Record<string, string>,
  token: string
) {
  const qs = new URLSearchParams(query).toString();
  const url = `http://localhost/api/integrations/${provider}/callback?${qs}`;
  const headers = { authorization: `Bearer ${token}` };
  return callback(new Request(url, { headers }), {
    params: Promise.resolve({ provider }),
  });
}

function location(res: Response): string {
  const url = new URL(res.headers.get('location') ?? '');
  return `${url.pathname}${url.search}`;
}

async function errorCode(res: Response): Promise<string> {
  return ((await res.json()) as { errorCode: string }).errorCode;
}

describe('GET /api/integrations/[provider]/callback (row 98a)', () => {
  let workspaceId: string;
  let token: string;

  beforeEach(async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('MARKETPLACE_PROVIDERS_ENABLED', 'shopee');
    vi.stubEnv('SHOPEE_PARTNER_ID', '100098');
    vi.stubEnv('SHOPEE_PARTNER_KEY', 'dummy-partner-key-98a');
    vi.stubEnv('SHOPEE_API_HOST', 'https://shopee.sandbox.test');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockClear();
    __resetAuthForTests();
    __resetMembershipForTests();
    __resetIntegrationsForTests();
    const owner = { ...ADMIN, workspaceName: OWNER_NAME };
    ({ workspaceId } = await seedFixtureCredential(owner));
    token = await signInToken(ADMIN, workspaceId);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    __resetIntegrationsForTests();
  });

  it('answers a replayed state with 410 and an unknown provider with 404', async () => {
    const state = await startState(workspaceId, token);
    const first = await callbackGet('shopee', { state }, token);
    expect(first.status).toBe(303);
    expect(location(first)).toBe(
      `/w/${workspaceId}/integrasi/hubungkan?provider=shopee&result=cancelled`
    );
    const replay = await callbackGet('shopee', { state, code: 'c' }, token);
    expect(replay.status).toBe(410);
    expect(replay.headers.get('location')).toBeNull();
    expect(await errorCode(replay)).toBe('STATE_INVALID');
    const unknown = await callbackGet('lazada', { state, code: 'c' }, token);
    expect(unknown.status).toBe(404);
    expect(await errorCode(unknown)).toBe('PROVIDER_NOT_AVAILABLE');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redirects a connect to the store page and queues the first import', async () => {
    const state = await startState(workspaceId, token);
    const query = { state, code: 'code-98a', shop_id: SHOP_ID };
    const res = await callbackGet('shopee', query, token);
    expect(res.status).toBe(303);
    const store = getIntegrationStore() as unknown as InMemoryIntegrationStore;
    const [row] = [...store.connections.rows.values()];
    expect(row).toMatchObject({ workspaceId, providerStoreId: SHOP_ID });
    expect(location(res)).toBe(
      `/w/${workspaceId}/integrasi/${row?.id}?result=connected`
    );
    // Catalog reads are a stubbed 503: the inline run fails, the import
    // stays queued (retryable via /import) and the connect still succeeds.
    expect(row?.importJobId).toBeTruthy();
    expect(row?.initialImportStatus).toBe('queued');
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.filter((u) => u.includes('/auth/token/get'))).toHaveLength(1);
  });

  it('redirects a store claimed elsewhere as blocked with no foreign workspace data', async () => {
    const state = await startState(workspaceId, token);
    await callbackGet('shopee', { state, code: 'c1', shop_id: SHOP_ID }, token);
    const other = await seedFixtureCredential(OTHER);
    const otherToken = await signInToken(OTHER, other.workspaceId);
    fetchMock.mockClear();
    const otherState = await startState(other.workspaceId, otherToken);
    const query = { state: otherState, code: 'c2', shop_id: SHOP_ID };
    const res = await callbackGet('shopee', query, otherToken);
    expect(res.status).toBe(303);
    const path = location(res);
    expect(path).toBe(
      `/w/${other.workspaceId}/integrasi/hubungkan?provider=shopee&result=blocked&store=${SHOP_ID}`
    );
    expect(path).not.toContain(workspaceId);
    expect(decodeURIComponent(path)).not.toContain(OWNER_NAME);
    expect(decodeURIComponent(path)).not.toContain('Toko Sari');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
