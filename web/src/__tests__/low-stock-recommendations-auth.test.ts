import { beforeEach, describe, expect, it } from 'vitest';
import { __resetAuthForTests, seedFixtureCredential } from '../lib/auth';
import { __resetMembershipForTests } from '../lib/membership';
import { __resetCatalogForTests } from '../lib/catalog';
import { POST as signIn } from '../app/api/auth/sign-in/route';
import { GET as listLowStock } from '../app/api/workspaces/[workspaceId]/catalog/low-stock-recommendations/route';

/**
 * GET low-stock-recommendations route auth (UTA-146 slice 1f-xi-a, Story 11):
 * no session is 401 INVALID_SESSION; a non-member workspace is 403
 * TENANCY_FORBIDDEN; a member gets 200 with an empty list.
 */

const ADMIN_EMAIL = 'owner@fixture.test';
const ADMIN_PASSWORD = 'sari-roti-88!';

function getLowStock(workspaceId: string, token?: string) {
  return listLowStock(
    new Request(
      `http://localhost/api/workspaces/${workspaceId}/catalog/low-stock-recommendations`,
      {
        method: 'GET',
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }
    ),
    { params: Promise.resolve({ workspaceId }) }
  );
}

describe('low-stock-recommendations route auth', () => {
  let workspaceId: string;
  let adminToken: string;

  beforeEach(async () => {
    __resetAuthForTests();
    __resetMembershipForTests();
    __resetCatalogForTests();
    ({ workspaceId } = await seedFixtureCredential({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }));
    const res = await signIn(
      new Request('http://localhost/api/auth/sign-in', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          workspaceId,
          platform: 'mobile',
        }),
      })
    );
    expect(res.status).toBe(200);
    ({ token: adminToken } = (await res.json()) as { token: string });
  });

  it('returns 401 INVALID_SESSION without a session', async () => {
    const res = await getLowStock(workspaceId);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe('INVALID_SESSION');
  });

  it('returns 403 TENANCY_FORBIDDEN for a workspace the caller is not in', async () => {
    const res = await getLowStock('ws_not_a_member', adminToken);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { errorCode: string };
    expect(body.errorCode).toBe('TENANCY_FORBIDDEN');
  });

  it('returns 200 with an empty list for a member with no low stock', async () => {
    const res = await getLowStock(workspaceId, adminToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { recommendations: unknown[] };
    expect(body.recommendations).toEqual([]);
  });
});
