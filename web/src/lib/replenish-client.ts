/**
 * Browser client for the Story 11 replenish Route Handlers (UTA-147, web).
 *
 * - Web sessions ride the HttpOnly `tb_session` cookie (`credentials:
 *   "same-origin"`); no tokens are kept in JS or storage.
 * - Thrown errors carry client-safe Bahasa Indonesia copy and never echo
 *   SKUs, quantities, or ids.
 * - `needsReauth` flags 401 `INVALID_SESSION` so pages can redirect to
 *   `/sign-in?expired=1`.
 */

import type {
  CreatePurchaseOrderDraftBody,
  LowStockRecommendationView,
  PurchaseOrderWithItemsView,
  RecommendationStateView,
  SetRecommendationStateBody,
  UpdatePurchaseOrderDraftBody,
} from '@tokoboss/contracts';

export class ReplenishClientError extends Error {
  readonly status: number;
  readonly errorCode: string;
  readonly needsReauth: boolean;
  constructor(opts: {
    status: number;
    errorCode: string;
    message: string;
    needsReauth?: boolean;
  }) {
    super(opts.message);
    this.name = 'ReplenishClientError';
    this.status = opts.status;
    this.errorCode = opts.errorCode;
    this.needsReauth = opts.needsReauth ?? false;
  }
}

type FetchFn = typeof fetch;

const MESSAGES: Record<number, string> = {
  400: 'Data tidak valid. Periksa lagi isiannya.',
  401: 'Sesi kamu sudah habis. Silakan masuk lagi.',
  403: 'Kamu tidak punya akses untuk tindakan ini.',
  404: 'Data tidak ditemukan.',
  409: 'Data sudah diubah orang lain. Muat ulang lalu coba lagi.',
};
const GENERIC = 'Terjadi kesalahan. Coba lagi sebentar lagi.';

async function readBody(res: Response): Promise<Record<string, unknown>> {
  try {
    const data = (await res.json()) as unknown;
    if (data && typeof data === 'object')
      return data as Record<string, unknown>;
  } catch {
    // Non-JSON (proxies, empty 500s) → generic handling below.
  }
  return {};
}

/** Map a failing response to a client-safe error (never echoes PII/SKUs). */
export function toReplenishClientError(
  status: number,
  body: Record<string, unknown>
): ReplenishClientError {
  const code =
    typeof body['errorCode'] === 'string'
      ? body['errorCode']
      : 'REPLENISH_FAILED';
  return new ReplenishClientError({
    status,
    errorCode: code,
    message: MESSAGES[status] ?? GENERIC,
    needsReauth: status === 401 && code === 'INVALID_SESSION',
  });
}

/** GET low-stock recommendations, optionally trimmed by `budgetCents`. */
export async function listLowStockRecommendations(
  workspaceId: string,
  opts: { budgetCents?: number } = {},
  fetchFn: FetchFn = fetch
): Promise<LowStockRecommendationView[]> {
  const query =
    opts.budgetCents === undefined ? '' : `?budgetCents=${opts.budgetCents}`;
  const res = await fetchFn(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/catalog/low-stock-recommendations${query}`,
    { method: 'GET', credentials: 'same-origin' }
  );
  const body = await readBody(res);
  if (!res.ok) throw toReplenishClientError(res.status, body);
  return Array.isArray(body['recommendations'])
    ? (body['recommendations'] as LowStockRecommendationView[])
    : [];
}

/** PUT dismiss / snooze / edit-qty state for one low-stock recommendation. */
export async function setRecommendationState(
  workspaceId: string,
  variantId: string,
  body: SetRecommendationStateBody,
  fetchFn: FetchFn = fetch
): Promise<RecommendationStateView> {
  const res = await fetchFn(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/catalog/variants/${encodeURIComponent(variantId)}/recommendation-state`,
    {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const data = await readBody(res);
  if (!res.ok) throw toReplenishClientError(res.status, data);
  return data['recommendationState'] as RecommendationStateView;
}

/** POST a draft purchase order built from low-stock recommendations. */
export async function createPurchaseOrderDraft(
  workspaceId: string,
  body: CreatePurchaseOrderDraftBody,
  fetchFn: FetchFn = fetch
): Promise<PurchaseOrderWithItemsView> {
  const res = await fetchFn(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/catalog/purchase-orders`,
    {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const data = await readBody(res);
  if (!res.ok) throw toReplenishClientError(res.status, data);
  return {
    purchaseOrder: data['purchaseOrder'],
    items: Array.isArray(data['items']) ? data['items'] : [],
  } as PurchaseOrderWithItemsView;
}

/** PATCH a DRAFT purchase order (supplier, notes, full item list; CAS). */
export async function updatePurchaseOrderDraft(
  workspaceId: string,
  purchaseOrderId: string,
  body: UpdatePurchaseOrderDraftBody,
  fetchFn: FetchFn = fetch
): Promise<PurchaseOrderWithItemsView> {
  const res = await fetchFn(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/catalog/purchase-orders/${encodeURIComponent(purchaseOrderId)}`,
    {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const data = await readBody(res);
  if (!res.ok) throw toReplenishClientError(res.status, data);
  return {
    purchaseOrder: data['purchaseOrder'],
    items: Array.isArray(data['items']) ? data['items'] : [],
  } as PurchaseOrderWithItemsView;
}
