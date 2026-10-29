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
import {
  DELETE as disconnect,
  GET as detail,
} from '@/app/api/workspaces/[workspaceId]/integrations/[connectionId]/route';
import { PATCH as controls } from '@/app/api/workspaces/[workspaceId]/integrations/[connectionId]/controls/route';
import { GET as activity } from '@/app/api/workspaces/[workspaceId]/integrations/[connectionId]/activity/route';

/**
 * Story 18 route tests (UTA-38 / US18, RFC 07 row 28): Admin controls +
 * reconcile on resume, Manager / Staff read-only (403 writes, 200 activity
 * and detail), and the optional PUTUSKAN confirmation on DELETE (422).
 */

const ADMIN = ['owner@fixture.test', 'sari-roti-88!'] as const;
const MANAGER = ['manager@fixture.test', 'manager-bakso-77'] as const;
const STAFF = ['clerk@fixture.test', 'clerk-noodles-99'] as const;
const CONNECTION_ID = '00000000-0000-4000-8000-000000000028';
const CONFIRMED = { confirmationText: 'PUTUSKAN' } as const;
const BOTH_ON = { orderImportEnabled: true, inventorySyncEnabled: true };

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

describe('connection controls, activity and Putuskan routes (row 28)', () => {
  let workspaceId: string;
  let tokens: Record<'admin' | 'manager' | 'staff', string>;

  async function signInToken(email: string, password: string) {
    const body = { email, password, workspaceId, platform: 'mobile' };
    const res = await signIn(req('/api/auth/sign-in', 'POST', '', body));
    expect(res.status).toBe(200);
    return ((await res.json()) as { token: string }).token;
  }

  async function join(
    [email, password]: readonly [string, string],
    role: string
  ) {
    const path = `/api/workspaces/${workspaceId}/invites`;
    const invited = await createInvite(
      req(path, 'POST', tokens.admin, { email, role }),
      { params: Promise.resolve({ workspaceId }) }
    );
    expect(invited.status).toBe(201);
    const { token } = (await invited.json()) as { token: string };
    const accept = { token, newPassword: password };
    const accepted = await acceptInvite(
      req('/api/invites/accept', 'POST', '', accept)
    );
    expect(accepted.status).toBe(200);
    return signInToken(email, password);
  }

  /** One connected TikTok Shop store under a UUID id, both switches off. */
  async function seedConnectedStore() {
    const store = getIntegrationStore();
    const connections = store.connections as InMemoryConnectionStore;
    const row = await connections.upsert({
      workspaceId,
      provider: 'tiktok_shop',
      connectMode: 'oauth_redirect',
      shop: {
        providerStoreId: 'shop-28',
        providerAccountId: null,
        shopCipher: 'cipher-28',
        storeName: 'Toko Row 28',
        region: 'ID',
      },
      grantedScopes: [],
      accessTokenExpiresAt: null,
      authExpiresAt: new Date(Date.now() + 20 * 86_400_000),
      connectedBy: 'user-admin',
      connectedAt: new Date(),
    });
    connections.rows.delete(row.id);
    connections.rows.set(CONNECTION_ID, { ...row, id: CONNECTION_ID });
  }

  const base = () =>
    `/api/workspaces/${workspaceId}/integrations/${CONNECTION_ID}`;
  const params = () => ({
    params: Promise.resolve({ workspaceId, connectionId: CONNECTION_ID }),
  });
  const patch = (token: string, body: unknown) =>
    controls(req(`${base()}/controls`, 'PATCH', token, body), params());
  const putuskan = (token: string, body?: unknown) =>
    disconnect(req(base(), 'DELETE', token, body), params());

  beforeEach(async () => {
    __resetAuthForTests();
    __resetMembershipForTests();
    __resetIntegrationsForTests();
    const fakes = __resetIntegrationManagementForTests();
    ({ workspaceId } = await seedFixtureCredential({
      email: ADMIN[0],
      password: ADMIN[1],
    }));
    tokens = { admin: await signInToken(...ADMIN), manager: '', staff: '' };
    tokens.manager = await join(MANAGER, 'manager');
    tokens.staff = await join(STAFF, 'staff');
    await seedConnectedStore();
    fakes.activity.record({
      id: 'act-28',
      workspaceId,
      action: 'integration.connected',
      connectionId: CONNECTION_ID,
      provider: 'tiktok_shop',
      storeName: 'Toko Row 28',
      actorType: 'user',
      actorId: 'user-admin',
      occurredAt: new Date('2026-10-28T03:00:00Z'),
      payload: { connectionId: CONNECTION_ID },
    });
  });

  it('lets an Admin toggle both switches and queues reconcile on resume', async () => {
    const resumed = await patch(tokens.admin, BOTH_ON);
    expect(resumed.status).toBe(200);
    expect(await resumed.json()).toMatchObject({
      connection: BOTH_ON,
      reconciliationQueued: true,
    });

    const paused = await patch(tokens.admin, { inventorySyncEnabled: false });
    expect(paused.status).toBe(200);
    expect(await paused.json()).toMatchObject({
      connection: { orderImportEnabled: true, inventorySyncEnabled: false },
      reconciliationQueued: false,
    });
  });

  it('keeps Manager and Staff read-only: 403 writes, 200 activity', async () => {
    for (const token of [tokens.manager, tokens.staff]) {
      for (const res of [
        await patch(token, { orderImportEnabled: true }),
        await putuskan(token, CONFIRMED),
      ]) {
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ errorCode: 'ROLE_FORBIDDEN' });
      }
      const feed = await activity(
        req(`${base()}/activity`, 'GET', token),
        params()
      );
      expect(feed.status).toBe(200);
      const { items } = (await feed.json()) as { items: { id: string }[] };
      expect(items.map((item) => item.id)).toEqual(['act-28']);
      const view = await detail(req(base(), 'GET', token), params());
      expect(view.status).toBe(200);
      expect(await view.json()).toMatchObject({
        connection: { id: CONNECTION_ID, status: 'connected' },
        health: { status: 'paused_full' },
        metrics: { mappedSkuCount: 0 },
      });
    }
  });

  it('enforces the PUTUSKAN confirmation on DELETE when a body is sent', async () => {
    for (const body of [{ confirmationText: 'putuskan' }, { reason: 'x' }]) {
      const rejected = await putuskan(tokens.admin, body);
      expect(rejected.status).toBe(422);
      expect(await rejected.json()).toMatchObject({
        errorCode: 'INTEGRATION_VALIDATION',
      });
    }
    const store = getIntegrationStore().connections;
    expect((await store.find(workspaceId, CONNECTION_ID))?.status).toBe(
      'connected'
    );

    const confirmed = await putuskan(tokens.admin, CONFIRMED);
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toMatchObject({
      connection: { id: CONNECTION_ID, status: 'disconnected' },
    });
  });
});
