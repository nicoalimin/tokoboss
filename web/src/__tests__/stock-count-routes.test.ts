import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetAuthForTests,
  getMemberStore,
  seedFixtureCredential,
} from '../lib/auth';
import { __resetMembershipForTests } from '../lib/membership';
import { __resetCatalogForTests } from '../lib/catalog';
import { __resetStockCountForTests } from '../lib/stock-count';
import { POST as signIn } from '../app/api/auth/sign-in/route';
import { POST as createWarehouse } from '../app/api/workspaces/[workspaceId]/catalog/warehouses/route';
import { POST as createProduct } from '../app/api/workspaces/[workspaceId]/catalog/products/route';
import {
  GET as listCounts,
  POST as startCount,
} from '../app/api/workspaces/[workspaceId]/stock-counts/route';
import { GET as getCount } from '../app/api/workspaces/[workspaceId]/stock-counts/[sessionId]/route';
import { POST as postCount } from '../app/api/workspaces/[workspaceId]/stock-counts/[sessionId]/post/route';

/** US12 / RFC 03 task 38: 404 parity, 403 Staff post, list scope. */
const ADMIN = { email: 'owner@fixture.test', password: 'sari-roti-88!' };
const STAFF = { email: 'clerk@fixture.test', password: 'clerk-noodles-99' };
function r(
  path: string,
  body?: unknown,
  token?: string,
  method = 'POST'
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function wp(workspaceId: string) {
  return { params: Promise.resolve({ workspaceId }) };
}
function wps(workspaceId: string, sessionId: string) {
  return { params: Promise.resolve({ workspaceId, sessionId }) };
}

async function expectErr(res: Response, status: number, errorCode: string) {
  expect(res.status).toBe(status);
  expect(((await res.json()) as { errorCode: string }).errorCode).toBe(
    errorCode
  );
}
describe('stock-count routes auth and scope (RFC 03 task 38)', () => {
  let ws: string;
  let admin: string;
  let staff: string;
  let jkt: string;
  let bdg: string;
  let jktSess: string;
  let bdgSess: string;
  async function sign(email: string, password: string): Promise<string> {
    const res = await signIn(
      r('/api/auth/sign-in', {
        email,
        password,
        workspaceId: ws,
        platform: 'mobile',
      })
    );
    expect(res.status).toBe(200);
    return ((await res.json()) as { token: string }).token;
  }

  beforeEach(async () => {
    __resetAuthForTests();
    __resetMembershipForTests();
    __resetCatalogForTests();
    __resetStockCountForTests();
    ({ workspaceId: ws } = await seedFixtureCredential(ADMIN));
    admin = await sign(ADMIN.email, ADMIN.password);

    const wh = async (code: string, name: string) => {
      const res = await createWarehouse(
        r(`/api/workspaces/${ws}/catalog/warehouses`, { code, name }, admin),
        wp(ws)
      );
      expect(res.status).toBe(201);
      return ((await res.json()) as { warehouse: { id: string } }).warehouse.id;
    };
    jkt = await wh('JKT-SC', 'Gudang JKT-SC');
    bdg = await wh('BDG-SC', 'Gudang BDG-SC');

    const prod = await createProduct(
      r(
        `/api/workspaces/${ws}/catalog/products`,
        {
          name: 'Kaos',
          unit: 'pcs',
          variants: [
            { skuCode: 'KAOS-SC-A', name: 'A', sellingPriceCents: 99000 },
          ],
        },
        admin
      ),
      wp(ws)
    );
    expect(prod.status).toBe(201);

    const { userId: staffUserId } = await seedFixtureCredential({
      ...STAFF,
      role: 'staff',
    });
    await getMemberStore().create({
      workspaceId: ws,
      userId: staffUserId,
      role: 'staff',
      warehouseScope: jkt,
      status: 'active',
    });
    staff = await sign(STAFF.email, STAFF.password);

    const start = async (warehouseId: string, name: string) => {
      const res = await startCount(
        r(
          `/api/workspaces/${ws}/stock-counts`,
          { warehouseId, name, scopeType: 'all' },
          admin
        ),
        wp(ws)
      );
      expect(res.status).toBe(201);
      return ((await res.json()) as { session: { id: string } }).session.id;
    };
    jktSess = await start(jkt, 'Opname JKT');
    bdgSess = await start(bdg, 'Opname BDG');
  });
  it('404 parity: non-member, unknown session, out-of-scope warehouse', async () => {
    await expectErr(
      await listCounts(
        r('/api/workspaces/ws_x/stock-counts', undefined, admin, 'GET'),
        wp('ws_x')
      ),
      404,
      'WORKSPACE_NOT_AVAILABLE'
    );
    await expectErr(
      await getCount(
        r(`/api/workspaces/${ws}/stock-counts/sess_x`, undefined, admin, 'GET'),
        wps(ws, 'sess_x')
      ),
      404,
      'STOCK_COUNT_NOT_FOUND'
    );
    await expectErr(
      await getCount(
        r(
          `/api/workspaces/${ws}/stock-counts/${bdgSess}`,
          undefined,
          staff,
          'GET'
        ),
        wps(ws, bdgSess)
      ),
      404,
      'STOCK_COUNT_NOT_FOUND'
    );
  });
  it('returns 403 TENANCY_FORBIDDEN when Staff posts', async () => {
    await expectErr(
      await postCount(
        r(
          `/api/workspaces/${ws}/stock-counts/${jktSess}/post`,
          {
            expectedVersion: 1,
            idempotencyKey: 'post-staff-deny-01',
            lines: [],
          },
          staff
        ),
        wps(ws, jktSess)
      ),
      403,
      'TENANCY_FORBIDDEN'
    );
  });
  it('scopes the list to the caller warehouse', async () => {
    const res = await listCounts(
      r(`/api/workspaces/${ws}/stock-counts`, undefined, staff, 'GET'),
      wp(ws)
    );
    expect(res.status).toBe(200);
    const { sessions } = (await res.json()) as {
      sessions: Array<{ id: string; warehouseId: string }>;
    };
    expect(sessions.map((s) => s.id)).toEqual([jktSess]);
    expect(sessions[0]!.warehouseId).toBe(jkt);
    expect(sessions.some((s) => s.id === bdgSess)).toBe(false);
  });
});
