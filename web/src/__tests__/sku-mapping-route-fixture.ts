import { expect } from 'vitest';
import { __resetAuthForTests, seedFixtureCredential } from '../lib/auth';
import { __resetMembershipForTests } from '../lib/membership';
import { __resetSkuMappingsForTests } from '../lib/sku-mappings';
import { POST as signIn } from '../app/api/auth/sign-in/route';

/** Memory-mode fixture for sku-mappings route tests (RFC 05 task 49a). */

export const VAR_A = '00000000-0000-4000-8000-0000000049a1';
export const VAR_B = '00000000-0000-4000-8000-0000000049b2';
export const LST = [1, 2, 3].map(
  (n) => `00000000-0000-4000-8000-00000000491${n}`
);
const CONN = 'conn-49';

export function apiRequest(
  path: string,
  token: string | undefined,
  method = 'GET',
  body?: unknown
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

/** Seeds a fresh fixture workspace with one member of `role`, signed in. */
export async function seedCaller(role: 'admin' | 'manager' | 'staff') {
  const email = `${role}@sku49.test`;
  const password = `${role}-petakan-49!`;
  const seeded = await seedFixtureCredential({ email, password, role });
  const { workspaceId } = seeded;
  const body = { email, password, workspaceId, platform: 'mobile' };
  const res = await signIn(
    apiRequest('/api/auth/sign-in', undefined, 'POST', body)
  );
  expect(res.status).toBe(200);
  const { token } = (await res.json()) as { token: string };
  return { workspaceId, token };
}

function variant(workspaceId: string, id: string, skuCode: string) {
  return {
    workspaceId,
    id,
    productId: `prod-${skuCode}`,
    skuCode,
    barcode: null,
    status: 'active' as const,
    archivedAt: null,
    productName: `Kaos ${skuCode}`,
    variantName: null,
    totalStockQty: 10,
    linkedStockQtyByConnection: {},
  };
}

function listing(ws: string, n: number, sku: string, suggested: string[]) {
  return {
    workspaceId: ws,
    listingId: LST[n - 1]!,
    connectionId: CONN,
    channel: 'shopee' as const,
    shopExtId: 'SHOP-49',
    connectionConnected: true,
    storeDisplayName: 'Toko Kopi',
    externalItemId: `ITEM-${n}`,
    platformSkuId: `PSKU-${n}`,
    storeSkuText: sku,
    barcodeHint: null,
    title: `Kaos ${n}`,
    variantName: null,
    listingStatus: 'NORMAL',
    providerStock: 5,
    mappingState:
      suggested.length > 1 ? ('ambiguous' as const) : ('suggested' as const),
    suggestedVariantIds: suggested,
    candidateSkuCodes: [],
    lastSeenAt: new Date('2026-10-28T06:00:00.000Z'),
  };
}

export function resetSkuMappingRoutes(): void {
  __resetAuthForTests();
  __resetMembershipForTests();
  __resetSkuMappingsForTests();
}

/** Store, SKU-A/B, listings 1-2 single suggestions, listing 3 ambiguous. */
export function seedSkuMappings(ws: string): void {
  __resetSkuMappingsForTests({
    stores: [
      {
        workspaceId: ws,
        connectionId: CONN,
        provider: 'shopee',
        providerStoreId: 'SHOP-49',
        displayName: 'Toko Kopi',
        status: 'connected',
      },
    ],
    variants: [variant(ws, VAR_A, 'SKU-A'), variant(ws, VAR_B, 'SKU-B')],
    listings: [
      listing(ws, 1, 'SKU-A', [VAR_A]),
      listing(ws, 2, 'SKU-B', [VAR_B]),
      listing(ws, 3, 'KAOS', [VAR_A, VAR_B]),
    ],
  });
}
