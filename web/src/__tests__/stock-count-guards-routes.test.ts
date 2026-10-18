import { beforeEach, describe, expect, it } from 'vitest';
import { __resetAuthForTests, seedFixtureCredential } from '../lib/auth';
import { __resetMembershipForTests } from '../lib/membership';
import { __resetCatalogForTests } from '../lib/catalog';
import { __resetStockCountForTests } from '../lib/stock-count';
import { POST as signIn } from '../app/api/auth/sign-in/route';
import { POST as createWarehouse } from '../app/api/workspaces/[workspaceId]/catalog/warehouses/route';
import { PATCH as patchWarehouse } from '../app/api/workspaces/[workspaceId]/catalog/warehouses/[warehouseId]/route';
import { POST as createProduct } from '../app/api/workspaces/[workspaceId]/catalog/products/route';
import { POST as createTransfer } from '../app/api/workspaces/[workspaceId]/catalog/transfers/route';
import { POST as sendTransfer } from '../app/api/workspaces/[workspaceId]/catalog/transfers/[transferId]/send/route';
import { POST as startCount } from '../app/api/workspaces/[workspaceId]/stock-counts/route';
import { POST as recordEntry } from '../app/api/workspaces/[workspaceId]/stock-counts/[sessionId]/entries/route';
import { POST as countAction } from '../app/api/workspaces/[workspaceId]/stock-counts/[sessionId]/actions/route';
import { POST as postCount } from '../app/api/workspaces/[workspaceId]/stock-counts/[sessionId]/post/route';

/** US12 / RFC 03 task 39: freeze, warehouse guard, post replay. */
const ADMIN = { email: 'owner@fixture.test', password: 'sari-roti-88!' };
const SC = { name: 'Opname', scopeType: 'all' };
const VARIANT = { skuCode: 'KAOS-GD-A', name: 'A', sellingPriceCents: 99000 };
function r(path: string, body: unknown, token: string, method = 'POST') {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
function p<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}
async function json<T>(res: Response, status: number): Promise<T> {
  expect(res.status).toBe(status);
  return (await res.json()) as T;
}
type Session = { session: { id: string; version: number; status: string } };

describe('stock-count guard routes (RFC 03 task 39)', () => {
  let ws: string;
  let admin: string;
  let jkt: string;
  let bdg: string;
  const base = () => `/api/workspaces/${ws}`;
  const start = async (warehouseId: string, freeze: boolean) => {
    const body = { ...SC, warehouseId, freezeOutboundTransfers: freeze };
    const ctx = p({ workspaceId: ws });
    return json<Session>(
      await startCount(r(`${base()}/stock-counts`, body, admin), ctx),
      201
    );
  };
  const act = async (sessionId: string, body: Record<string, unknown>) =>
    json<Session>(
      await countAction(
        r(`${base()}/stock-counts/${sessionId}/actions`, body, admin),
        p({ workspaceId: ws, sessionId })
      ),
      200
    );

  beforeEach(async () => {
    __resetAuthForTests();
    __resetMembershipForTests();
    __resetCatalogForTests();
    __resetStockCountForTests();
    ({ workspaceId: ws } = await seedFixtureCredential(ADMIN));
    const login = { ...ADMIN, workspaceId: ws, platform: 'mobile' };
    const signed = await signIn(r('/api/auth/sign-in', login, ''));
    admin = (await json<{ token: string }>(signed, 200)).token;
    const wh = async (code: string) =>
      (
        await json<{ warehouse: { id: string } }>(
          await createWarehouse(
            r(`${base()}/catalog/warehouses`, { code, name: code }, admin),
            p({ workspaceId: ws })
          ),
          201
        )
      ).warehouse.id;
    jkt = await wh('JKT-GD');
    bdg = await wh('BDG-GD');
    const product = { name: 'Kaos', unit: 'pcs', variants: [VARIANT] };
    const ctx = p({ workspaceId: ws });
    const res = await createProduct(
      r(`${base()}/catalog/products`, product, admin),
      ctx
    );
    expect(res.status).toBe(201);
  });

  it('blocks sending a transfer out of a frozen warehouse (409)', async () => {
    const { session } = await start(jkt, true);
    const created = await json<{ transfer: { id: string } }>(
      await createTransfer(
        r(
          `${base()}/catalog/transfers`,
          {
            referenceNum: 'TRF-GD-1',
            sourceWarehouseId: jkt,
            destWarehouseId: bdg,
          },
          admin
        ),
        p({ workspaceId: ws })
      ),
      201
    );
    const transferId = created.transfer.id;
    const send = () =>
      sendTransfer(
        r(`${base()}/catalog/transfers/${transferId}/send`, {}, admin),
        p({ workspaceId: ws, transferId })
      );
    const frozen = await json<{ errorCode: string }>(await send(), 409);
    expect(frozen.errorCode).toBe('STOCK_COUNT_FREEZE');
    await act(session.id, {
      action: 'freeze',
      expectedVersion: session.version,
      freeze: false,
    });
    const after = (await (await send()).json()) as { errorCode?: string };
    expect(after.errorCode).not.toBe('STOCK_COUNT_FREEZE');
  });

  it('blocks deactivating a warehouse with an open count (409)', async () => {
    const { session } = await start(bdg, false);
    const deactivate = () =>
      patchWarehouse(
        r(
          `${base()}/catalog/warehouses/${bdg}`,
          { status: 'deactivated', expectedVersion: 1 },
          admin,
          'PATCH'
        ),
        p({ workspaceId: ws, warehouseId: bdg })
      );
    const blocked = await json<{ errorCode: string }>(await deactivate(), 409);
    expect(blocked.errorCode).toBe('STOCK_COUNT_ACTIVE');
    await act(session.id, {
      action: 'cancel',
      expectedVersion: session.version,
      note: 'Batal opname',
    });
    const ok = await json<{ warehouse: { status: string } }>(
      await deactivate(),
      200
    );
    expect(ok.warehouse.status).toBe('deactivated');
  });

  it('replays a post with the same idempotencyKey (deduplicated)', async () => {
    const started = await start(jkt, false);
    const sid = started.session.id;
    const entry = { scanCode: 'KAOS-GD-A', qty: 0, mode: 'replace' };
    await json(
      await recordEntry(
        r(
          `${base()}/stock-counts/${sid}/entries`,
          { ...entry, clientEntryId: 'entry-gd-0001' },
          admin
        ),
        p({ workspaceId: ws, sessionId: sid })
      ),
      201
    );
    const { session } = await act(sid, {
      action: 'submit',
      expectedVersion: started.session.version,
    });
    const post = () =>
      postCount(
        r(
          `${base()}/stock-counts/${session.id}/post`,
          {
            expectedVersion: session.version,
            idempotencyKey: 'post-replay-0001',
          },
          admin
        ),
        p({ workspaceId: ws, sessionId: session.id })
      );
    type Posted = Session & { deduplicated: boolean };
    const first = await json<Posted>(await post(), 200);
    expect(first.session.status).toBe('posted');
    expect(first.deduplicated).toBe(false);
    const replay = await json<Posted>(await post(), 200);
    expect(replay.deduplicated).toBe(true);
    expect(replay.session.id).toBe(session.id);
  });
});
