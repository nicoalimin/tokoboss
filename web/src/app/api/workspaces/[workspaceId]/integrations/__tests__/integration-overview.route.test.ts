import { beforeEach, describe, expect, it } from 'vitest';
import type { InMemoryConnectionStore } from '@tokoboss/application';
import { __resetAuthForTests, seedFixtureCredential } from '@/lib/auth';
import { __resetMembershipForTests } from '@/lib/membership';
import {
  __resetIntegrationsForTests,
  getIntegrationStore,
} from '@/lib/integrations';
import { __resetIntegrationManagementForTests } from '@/lib/integration-management-reads';
import { POST as signIn } from '@/app/api/auth/sign-in/route';
import { POST as createInvite } from '@/app/api/workspaces/[workspaceId]/invites/route';
import { POST as acceptInvite } from '@/app/api/invites/accept/route';
import { GET as overview } from '@/app/api/workspaces/[workspaceId]/integrations/overview/route';

/**
 * Story 18 overview route tests (UTA-38 / US18, RFC 07 addendum row 44h):
 * Staff 200 with KPI bar + rows; non-member 404 WORKSPACE_NOT_AVAILABLE
 * (no store leak); unauthenticated 401.
 */

const ADMIN = ['owner@fixture.test', 'sari-roti-88!'] as const;
const STAFF = ['clerk@fixture.test', 'clerk-noodles-99'] as const;
const CONNECTION_ID = '00000000-0000-4000-8000-000000000044';
const STORE_NAME = 'Toko Row 44h';

function req(path: string, method: string, token?: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe('integration overview route (row 44h)', () => {
  let workspaceId: string;
  let tokens: Record<'admin' | 'staff', string>;

  async function signInToken(email: string, password: string) {
    const body = { email, password, workspaceId, platform: 'mobile' };
    const res = await signIn(req('/api/auth/sign-in', 'POST', '', body));
    expect(res.status).toBe(200);
    return ((await res.json()) as { token: string }).token;
  }

  async function joinStaff() {
    const path = `/api/workspaces/${workspaceId}/invites`;
    const invited = await createInvite(
      req(path, 'POST', tokens.admin, { email: STAFF[0], role: 'staff' }),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(invited.status).toBe(201);
    const { token } = (await invited.json()) as { token: string };
    const accepted = await acceptInvite(
      req('/api/invites/accept', 'POST', '', {
        token,
        newPassword: STAFF[1],
      })
    );
    expect(accepted.status).toBe(200);
    return signInToken(...STAFF);
  }

  /** One healthy connected Shopee store under a fixed UUID id. */
  async function seedHealthyStore() {
    const store = getIntegrationStore();
    const connections = store.connections as InMemoryConnectionStore;
    const row = await connections.upsert({
      workspaceId,
      provider: 'shopee',
      connectMode: 'oauth_redirect',
      shop: {
        providerStoreId: 'shop-44h',
        providerAccountId: null,
        shopCipher: null,
        storeName: STORE_NAME,
        region: 'ID',
      },
      grantedScopes: ['product', 'order'],
      accessTokenExpiresAt: null,
      authExpiresAt: new Date(Date.now() + 20 * 86_400_000),
      connectedBy: 'user-admin',
      connectedAt: new Date('2026-10-30T03:00:00.000Z'),
    });
    connections.rows.delete(row.id);
    connections.rows.set(CONNECTION_ID, { ...row, id: CONNECTION_ID });
  }

  const pathFor = (id: string) => `/api/workspaces/${id}/integrations/overview`;
  const paramsFor = (id: string) => ({
    params: Promise.resolve({ workspaceId: id }),
  });
  const getOverview = (id: string, token?: string) =>
    overview(req(pathFor(id), 'GET', token), paramsFor(id));

  beforeEach(async () => {
    __resetAuthForTests();
    __resetMembershipForTests();
    __resetIntegrationsForTests();
    const fakes = __resetIntegrationManagementForTests();
    ({ workspaceId } = await seedFixtureCredential({
      email: ADMIN[0],
      password: ADMIN[1],
    }));
    tokens = { admin: await signInToken(...ADMIN), staff: '' };
    tokens.staff = await joinStaff();
    await seedHealthyStore();
    fakes.metrics.setMetrics(workspaceId, {
      connectionId: CONNECTION_ID,
      mappedSkuCount: 12,
      linkedWarehouseCount: 1,
      linkedWarehouseCodes: ['GDG-1'],
    });
    fakes.activity.record({
      id: 'act-44h',
      workspaceId,
      action: 'integration.connected',
      connectionId: CONNECTION_ID,
      provider: 'shopee',
      storeName: STORE_NAME,
      actorType: 'user',
      actorId: 'user-admin',
      occurredAt: new Date('2026-10-30T03:00:00.000Z'),
      payload: { connectionId: CONNECTION_ID },
    });
  });

  it('lets a staff member get 200 with the KPI bar counts and rows', async () => {
    const res = await getOverview(workspaceId, tokens.staff);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      kpis: {
        totalStores: number;
        healthyActiveCount: number;
        pausedCount: number;
        needsReauthCount: number;
      };
      stores: {
        connection: { id: string; storeName: string };
        health: { status: string };
        metrics: { mappedSkuCount: number };
      }[];
      activity: { id: string; storeName: string }[];
    };
    expect(body.kpis).toEqual({
      totalStores: 1,
      healthyActiveCount: 1,
      pausedCount: 0,
      needsReauthCount: 0,
    });
    expect(body.stores).toHaveLength(1);
    expect(body.stores[0]).toMatchObject({
      connection: { id: CONNECTION_ID, storeName: STORE_NAME },
      health: { status: 'healthy' },
      metrics: { mappedSkuCount: 12 },
    });
    expect(body.activity.map((a) => a.id)).toEqual(['act-44h']);
    expect(body.activity[0]?.storeName).toBe(STORE_NAME);
  });

  it('returns 404 WORKSPACE_NOT_AVAILABLE for a non-member with no store leak', async () => {
    const res = await getOverview('ws_not_a_member', tokens.admin);
    expect(res.status).toBe(404);
    const raw = await res.text();
    const body = JSON.parse(raw) as { errorCode: string };
    expect(body.errorCode).toBe('WORKSPACE_NOT_AVAILABLE');
    expect(raw).not.toContain(STORE_NAME);
    expect(raw).not.toContain(CONNECTION_ID);
    expect(raw).not.toContain('kpis');
    expect(raw).not.toContain('stores');
  });

  it('returns 401 when unauthenticated', async () => {
    const res = await getOverview(workspaceId);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ errorCode: 'INVALID_SESSION' });
  });
});
