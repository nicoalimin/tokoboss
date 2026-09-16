import { describe, expect, it, vi } from 'vitest';
import {
  BundleClientError,
  archiveBundle,
  createBundle,
  getBundle,
  listBundles,
  toBundleClientError,
  updateBundle,
} from '../lib/bundles-client';
import { bundlesCopyKeys, getBundlesCopy } from '../lib/bundles-copy';

/**
 * Web Bundles/BOM UI client (UTA-80): happy paths over the UTA-79 APIs,
 * cycle/conflict/version/stock mapping, re-auth mapping, and no-secret
 * error shapes.
 */

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(
  impl: (url: string, init?: RequestInit) => Promise<Response>
) {
  return vi.fn(impl) as unknown as typeof fetch & {
    mock: { calls: Array<[string, RequestInit?]> };
  };
}

const WS = 'ws_fixture_01';

function bundleFixture() {
  const now = new Date().toISOString();
  return {
    bundleVariantId: 'var_bundle_1',
    workspaceId: WS,
    skuCode: 'BUNDLE-HEMAT',
    status: 'active',
    version: 2,
    components: [
      {
        line: {
          id: 'line_1',
          workspaceId: WS,
          bundleVariantId: 'var_bundle_1',
          componentVariantId: 'var_comp_a',
          qty: 2,
          createdAt: now,
          updatedAt: now,
        },
        componentSkuCode: 'COMP-A',
        componentName: 'Komponen A',
        componentStatus: 'active',
      },
    ],
    availability: [{ warehouseId: 'wh_1', available: 5 }],
  };
}

describe('bundles-client (UTA-80 UI)', () => {
  it('lists and reads details over cookies with no tokens in play', async () => {
    const seen: Array<[string, RequestInit?]> = [];
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      seen.push([url, init]);
      if (String(url).endsWith('/catalog/bundles')) {
        return jsonResponse({ bundles: [bundleFixture()] }, 200);
      }
      return jsonResponse({ bundle: bundleFixture() }, 200);
    });

    const listed = await listBundles(WS, { fetchFn });
    expect(listed).toHaveLength(1);
    expect(listed[0]!.skuCode).toBe('BUNDLE-HEMAT');
    expect(listed[0]!.components[0]!.line.qty).toBe(2);

    const detail = await getBundle(WS, 'var_bundle_1', { fetchFn });
    expect(detail.availability[0]).toMatchObject({
      warehouseId: 'wh_1',
      available: 5,
    });
    expect(seen.every(([, init]) => init?.credentials === 'same-origin')).toBe(
      true
    );
    expect(JSON.stringify(seen)).not.toMatch(/Bearer|tb_session/);
  });

  it('creates BOMs with expectedVersion (Manager/Admin write)', async () => {
    const fetchFn = stubFetch(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`/api/workspaces/${WS}/catalog/bundles`);
      expect(init?.method).toBe('POST');
      expect(init?.credentials).toBe('same-origin');
      const body = JSON.parse(String(init?.body));
      expect(body.bundleVariantId).toBe('var_bundle_1');
      expect(body.expectedVersion).toBe(1);
      expect(body.components).toEqual([
        { componentVariantId: 'var_comp_a', qty: 2 },
      ]);
      return jsonResponse({ bundle: bundleFixture() }, 201);
    });
    const created = await createBundle(
      WS,
      {
        bundleVariantId: 'var_bundle_1',
        components: [{ componentVariantId: 'var_comp_a', qty: 2 }],
        expectedVersion: 1,
      },
      { fetchFn }
    );
    expect(created.skuCode).toBe('BUNDLE-HEMAT');
  });

  it('replaces lines with expectedVersion and archives idempotently', async () => {
    const patchFetch = stubFetch(async (url: string, init?: RequestInit) => {
      expect(url).toBe(
        `/api/workspaces/${WS}/catalog/bundles/var_bundle_1`
      );
      expect(init?.method).toBe('PATCH');
      const body = JSON.parse(String(init?.body));
      expect(body.expectedVersion).toBe(2);
      expect(body.components[0].qty).toBe(3);
      return jsonResponse({ bundle: bundleFixture() }, 200);
    });
    const updated = await updateBundle(
      WS,
      'var_bundle_1',
      {
        components: [{ componentVariantId: 'var_comp_a', qty: 3 }],
        expectedVersion: 2,
      },
      { fetchFn: patchFetch }
    );
    expect(updated.bundleVariantId).toBe('var_bundle_1');

    const archiveFetch = stubFetch(async (url: string, init?: RequestInit) => {
      expect(url).toBe(
        `/api/workspaces/${WS}/catalog/bundles/var_bundle_1/archive`
      );
      expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body));
      expect(body.expectedVersion).toBe(2);
      return jsonResponse(
        { bundle: { ...bundleFixture(), components: [] } },
        200
      );
    });
    const archived = await archiveBundle(
      WS,
      'var_bundle_1',
      { expectedVersion: 2 },
      { fetchFn: archiveFetch }
    );
    expect(archived.components).toEqual([]);
  });

  it('maps invalid sessions to re-auth and denials without echoing ids', async () => {
    const expired = toBundleClientError(
      401,
      { error: 'Session is expired.', errorCode: 'INVALID_SESSION' },
      'en'
    );
    expect(expired.needsReauth).toBe(true);
    expect(expired.message).toBe(getBundlesCopy('en').expiredNotice);

    const forbidden = toBundleClientError(
      403,
      { errorCode: 'TENANCY_FORBIDDEN' },
      'en'
    );
    expect(forbidden.message).toBe(getBundlesCopy('en').forbiddenError);
    expect(forbidden.message).not.toContain(WS);
  });

  it('surfaces cycles, conflicts, versions, and stock honestly', async () => {
    expect(
      toBundleClientError(422, { errorCode: 'BUNDLE_CYCLE' }, 'en').message
    ).toBe(getBundlesCopy('en').cycleError);
    expect(
      toBundleClientError(409, { errorCode: 'BUNDLE_CONFLICT' }, 'en').message
    ).toBe(getBundlesCopy('en').conflictError);
    expect(
      toBundleClientError(409, { errorCode: 'BUNDLE_VERSION_CONFLICT' }, 'en')
        .message
    ).toBe(getBundlesCopy('en').versionConflictError);
    expect(
      toBundleClientError(404, { errorCode: 'BUNDLE_NOT_FOUND' }, 'en').message
    ).toBe(getBundlesCopy('en').notFoundError);
    expect(
      toBundleClientError(422, { errorCode: 'BUNDLE_NO_DIRECT_STOCK' }, 'en')
        .message
    ).toBe(getBundlesCopy('en').noDirectStockError);
    expect(
      toBundleClientError(400, { errorCode: 'BUNDLE_VALIDATION' }, 'en').message
    ).toBe(getBundlesCopy('en').validationError);
  });

  it('thrown errors never echo SKUs, quantities, or ids', async () => {
    const fetchFn = stubFetch(async () =>
      jsonResponse(
        { error: 'Cycle detected.', errorCode: 'BUNDLE_CYCLE' },
        422
      )
    );
    const err = await createBundle(
      WS,
      {
        bundleVariantId: 'var_bundle_1',
        components: [{ componentVariantId: 'var_bundle_1', qty: 1 }],
        expectedVersion: 1,
      },
      { fetchFn }
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BundleClientError);
    const message = (err as BundleClientError).message;
    expect(message).toBe(getBundlesCopy('en').cycleError);
    expect(message).not.toContain('var_bundle_1');
    expect(JSON.stringify(err)).not.toMatch(/BUNDLE-HEMAT|Bearer/);
  });

  it('en/id copy stays in sync with no secret wording', async () => {
    const en = getBundlesCopy('en');
    const id = getBundlesCopy('id');
    expect(Object.keys(id).sort()).toEqual(bundlesCopyKeys().sort());
    for (const key of bundlesCopyKeys()) {
      for (const text of [en[key], id[key]]) {
        expect(text).not.toMatch(/passwordHash|tokenHash|Bearer|tb_session/);
      }
    }
  });
});
