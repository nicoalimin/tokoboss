import { beforeEach, describe, expect, it } from 'vitest';
import {
  GET as overview,
  POST as mapOne,
} from '../app/api/workspaces/[workspaceId]/sku-mappings/route';
import { POST as bulkMap } from '../app/api/workspaces/[workspaceId]/sku-mappings/bulk/route';
import { DELETE as unmap } from '../app/api/workspaces/[workspaceId]/sku-mappings/[mappingId]/route';
import { GET as history } from '../app/api/workspaces/[workspaceId]/sku-mappings/history/route';
import {
  apiRequest as req,
  LST,
  resetSkuMappingRoutes,
  seedCaller,
  seedSkuMappings,
  VAR_A,
  VAR_B,
} from './sku-mapping-route-fixture';

/** sku-mappings Route Handlers, memory wiring (UTA-40 / US03, RFC 05 task 49b). */

const base = (ws: string) => `/api/workspaces/${ws}/sku-mappings`;
const at = (workspaceId: string) => ({
  params: Promise.resolve({ workspaceId }),
});
type Json = Record<string, unknown> & { errorCode?: string };
const json = async (res: Response) => (await res.json()) as Json;

describe('sku-mappings routes (RFC 05 task 49b)', () => {
  beforeEach(() => resetSkuMappingRoutes());

  it('gives non-members the neutral 404 and Staff 403 on every write', async () => {
    const staff = await seedCaller('staff');
    const outsider = await seedCaller('admin');
    seedSkuMappings(staff.workspaceId);
    const ws = staff.workspaceId;

    for (const route of [overview, history]) {
      const res = await route(req(base(ws), outsider.token), at(ws));
      expect(res.status).toBe(404);
      expect((await json(res)).errorCode).toBe('WORKSPACE_NOT_AVAILABLE');
    }
    const body = { variantId: VAR_A, listingId: LST[0] };
    const writes = [
      await mapOne(req(base(ws), staff.token, 'POST', body), at(ws)),
      await bulkMap(
        req(`${base(ws)}/bulk`, staff.token, 'POST', { items: [body] }),
        at(ws)
      ),
      await unmap(req(`${base(ws)}/map-1`, staff.token, 'DELETE'), {
        params: Promise.resolve({ workspaceId: ws, mappingId: 'map-1' }),
      }),
    ];
    for (const res of writes) {
      expect(res.status).toBe(403);
      expect((await json(res)).errorCode).toBe('TENANCY_FORBIDDEN');
    }
    const read = await overview(req(base(ws), staff.token), at(ws));
    expect(read.status).toBe(200);
    expect(
      (await history(req(`${base(ws)}/history`, staff.token), at(ws))).status
    ).toBe(200);
  });

  it('maps, lists, unmaps and records history end-to-end for an Admin', async () => {
    const { workspaceId: ws, token } = await seedCaller('admin');
    seedSkuMappings(ws);
    const body = { variantId: VAR_A, listingId: LST[0] };
    const created = await mapOne(req(base(ws), token, 'POST', body), at(ws));
    expect(created.status).toBe(201);
    const { mapping, outcome } = (await created.json()) as {
      mapping: { mappingId: string; platformSkuId: string };
      outcome: string;
    };
    expect(outcome).toBe('mapped');
    expect(mapping.platformSkuId).toBe('PSKU-1');

    const listed = await json(await overview(req(base(ws), token), at(ws)));
    expect(listed.summary).toMatchObject({ mappedStoreSkusCount: 1 });

    const path = `${base(ws)}/${mapping.mappingId}`;
    const removed = await unmap(req(path, token, 'DELETE'), {
      params: Promise.resolve({
        workspaceId: ws,
        mappingId: mapping.mappingId,
      }),
    });
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({
      deleted: true,
      recomputedMappingState: 'suggested',
    });

    const res = await history(req(`${base(ws)}/history`, token), at(ws));
    const { events } = (await res.json()) as {
      events: Array<Record<string, unknown>>;
    };
    expect(
      events.map((e) => [e.action, e.skuCode, e.storeDisplayName])
    ).toEqual([
      ['unmapped', 'SKU-A', 'Toko Kopi'],
      ['mapped', 'SKU-A', 'Toko Kopi'],
    ]);
    expect(events.every((e) => e.actorDisplayName === 'Anggota tim')).toBe(
      true
    );
    expect(JSON.stringify(events)).not.toContain('@sku49.test');
  });

  it('bulk-maps suggestions for a Manager and rejects ambiguous batches with 422', async () => {
    const { workspaceId: ws, token } = await seedCaller('manager');
    seedSkuMappings(ws);
    const bulk = (items: unknown[]) =>
      bulkMap(req(`${base(ws)}/bulk`, token, 'POST', { items }), at(ws));

    const rejected = await bulk([
      { listingId: LST[1], variantId: VAR_B },
      { listingId: LST[2], variantId: VAR_A },
    ]);
    expect(rejected.status).toBe(422);
    expect(await json(rejected)).toMatchObject({
      errorCode: 'SKU_MAPPING_AMBIGUOUS_REQUIRES_REVIEW',
      details: { platformSkuIds: ['PSKU-3'] },
    });

    const ok = await bulk([
      { listingId: LST[0], variantId: VAR_A },
      { listingId: LST[1], variantId: VAR_B },
    ]);
    expect(ok.status).toBe(200);
    const done = (await ok.json()) as {
      mappedCount: number;
      mappings: Array<{ platformSkuId: string }>;
    };
    expect(done.mappedCount).toBe(2);
    expect(done.mappings.map((m) => m.platformSkuId).sort()).toEqual([
      'PSKU-1',
      'PSKU-2',
    ]);
  });
});
