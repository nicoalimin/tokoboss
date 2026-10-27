import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InMemoryIntegrationStore } from '@tokoboss/application';
import { __resetAuthForTests, seedFixtureCredential } from '../lib/auth';
import { __resetMembershipForTests } from '../lib/membership';
import {
  __resetIntegrationsForTests,
  getIntegrationStore,
} from '../lib/integrations';
import { POST as signIn } from '../app/api/auth/sign-in/route';
import { POST as createInvite } from '../app/api/workspaces/[workspaceId]/invites/route';
import { POST as acceptInvite } from '../app/api/invites/accept/route';
import { POST as connect } from '../app/api/workspaces/[workspaceId]/integrations/route';

/**
 * US20 / RFC 04 task 113c: first Blibli connect on POST /integrations
 * (113a) with Blibli enabled and a stubbed fetch. Keys are validated by one
 * read, sealed, never echoed. Admin only (Manager / Staff 403, non-member
 * 404); a bad key form is a 400; a store claimed elsewhere is a 409.
 */

const ADMIN = { email: 'owner@fixture.test', password: 'sari-roti-88!' };
const OTHER = { email: 'other@fixture.test', password: 'lain-toko-55!' };
const MANAGER = { email: 'manager@fixture.test', password: 'manager-bakso-77' };
const STAFF = { email: 'clerk@fixture.test', password: 'clerk-noodles-99' };
const KEYS = {
  merchantCode: 'BLI-113',
  apiSellerKey: 'seller-key-113c-secret',
  signatureKey: 'signature-key-113c-secret',
};

function apiRequest(path: string, body: unknown, token?: string): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

function vault() {
  return (getIntegrationStore() as unknown as InMemoryIntegrationStore).vault;
}

describe('POST /integrations first Blibli connect (task 113c)', () => {
  let workspaceId: string;
  let adminToken: string;
  const fetchMock = vi.fn(async (..._args: Parameters<typeof fetch>) =>
    Response.json({ success: true, content: [] })
  );

  async function signInToken(
    who: { email: string; password: string },
    id = workspaceId
  ): Promise<string> {
    const res = await signIn(
      apiRequest('/api/auth/sign-in', {
        ...who,
        workspaceId: id,
        platform: 'mobile',
      })
    );
    expect(res.status).toBe(200);
    return ((await res.json()) as { token: string }).token;
  }

  async function join(who: { email: string; password: string }, role: string) {
    const invited = await createInvite(
      apiRequest(
        `/api/workspaces/${workspaceId}/invites`,
        { email: who.email, role },
        adminToken
      ),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(invited.status).toBe(201);
    const { token } = (await invited.json()) as { token: string };
    const accepted = await acceptInvite(
      apiRequest('/api/invites/accept', { token, newPassword: who.password })
    );
    expect(accepted.status).toBe(200);
    return signInToken(who);
  }

  function post(id: string, body: unknown, token: string) {
    return connect(
      apiRequest(`/api/workspaces/${id}/integrations`, body, token),
      {
        params: Promise.resolve({ workspaceId: id }),
      }
    );
  }

  beforeEach(async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('MARKETPLACE_PROVIDERS_ENABLED', 'blibli');
    vi.stubEnv('BLIBLI_ENV', 'uat');
    vi.stubEnv('BLIBLI_CLIENT_ID', 'blibli-client-113c');
    vi.stubEnv('BLIBLI_CLIENT_KEY', 'blibli-client-key-113c');
    vi.stubEnv('BLIBLI_CHANNEL_ID', 'tokoboss');
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockClear();
    __resetAuthForTests();
    __resetMembershipForTests();
    __resetIntegrationsForTests();
    ({ workspaceId } = await seedFixtureCredential(ADMIN));
    adminToken = await signInToken(ADMIN);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    __resetIntegrationsForTests();
  });

  it('validates the keys with one read, seals them and never echoes them', async () => {
    const res = await post(
      workspaceId,
      { provider: 'blibli', ...KEYS },
      adminToken
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(KEYS.apiSellerKey);
    expect(text).not.toContain(KEYS.signatureKey);
    const { connection } = JSON.parse(text) as {
      connection: { id: string; provider: string; providerStoreId: string };
    };
    expect(connection.provider).toBe('blibli');
    expect(connection.providerStoreId).toBe(KEYS.merchantCode);
    // The first call is the one validation read; the inline first import
    // (task 141) adds its own reads after the keys are saved.
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('getProductList');
    const sealed = vault().sealed.get(connection.id);
    expect(sealed?.kind).toBe('blibli_keys');
    expect(sealed?.credentials.secrets).toMatchObject({
      apiSellerKey: KEYS.apiSellerKey,
      signatureKey: KEYS.signatureKey,
    });
  });

  it('is Admin only: Manager and Staff 403, non-member 404, no read', async () => {
    const body = { provider: 'blibli', ...KEYS };
    for (const token of [
      await join(MANAGER, 'manager'),
      await join(STAFF, 'staff'),
    ]) {
      const res = await post(workspaceId, body, token);
      expect(res.status).toBe(403);
      expect(((await res.json()) as { errorCode: string }).errorCode).toBe(
        'ROLE_FORBIDDEN'
      );
    }
    const stranger = await post('ws_not_a_member', body, adminToken);
    expect(stranger.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vault().sealed.size).toBe(0);
  });

  it('rejects a bad key form with 400 and a store claimed elsewhere with 409', async () => {
    for (const bad of [
      { provider: 'blibli', ...KEYS, signatureKey: '  ' },
      { provider: 'blibli', ...KEYS, extra: 'x' },
    ]) {
      const res = await post(workspaceId, bad, adminToken);
      expect(res.status).toBe(400);
      expect(((await res.json()) as { errorCode: string }).errorCode).toBe(
        'INTEGRATION_VALIDATION'
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
    const first = await post(
      workspaceId,
      { provider: 'blibli', ...KEYS },
      adminToken
    );
    expect(first.status).toBe(200);
    const other = await seedFixtureCredential(OTHER);
    const otherToken = await signInToken(OTHER, other.workspaceId);
    const res = await post(
      other.workspaceId,
      { provider: 'blibli', ...KEYS },
      otherToken
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { errorCode: string }).errorCode).toBe(
      'STORE_CONNECTED_ELSEWHERE'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vault().sealed.size).toBe(1);
  });
});
