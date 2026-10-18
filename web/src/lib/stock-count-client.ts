/**
 * Browser client for the US12 stock-opname Route Handlers (RFC 03 task 40a):
 * shared fetch helper plus list / start / detail. Entry, action and post
 * calls live in `stock-count-client-actions.ts` (40b).
 *
 * - Web sessions ride the HttpOnly `tb_session` cookie (`credentials:
 *   "same-origin"`); no tokens are kept in JS or storage.
 * - Thrown errors carry client-safe Bahasa Indonesia copy and never echo
 *   SKUs, quantities, or ids; `needsReauth` flags 401 `INVALID_SESSION`.
 */
import type {
  StartStockCountBody,
  StockCountDetailView,
  StockCountListItemView,
  StockCountSessionView,
  StockCountStatusWire,
} from '@tokoboss/contracts';

export class StockCountClientError extends Error {
  readonly status: number;
  readonly errorCode: string;
  readonly needsReauth: boolean;
  constructor(status: number, errorCode: string, message: string) {
    super(message);
    this.name = 'StockCountClientError';
    this.status = status;
    this.errorCode = errorCode;
    this.needsReauth = status === 401 && errorCode === 'INVALID_SESSION';
  }
}

export type FetchFn = typeof fetch;
export type Session = { session: StockCountSessionView };

const MESSAGES: Record<number, string> = {
  400: 'Data tidak valid. Periksa lagi isiannya.',
  401: 'Sesi kamu sudah habis. Silakan masuk lagi.',
  403: 'Kamu tidak punya akses untuk tindakan ini.',
  404: 'Sesi opname tidak ditemukan.',
  409: 'Sesi opname sudah berubah. Muat ulang lalu coba lagi.',
};
const GENERIC = 'Terjadi kesalahan. Coba lagi sebentar lagi.';

/** GET (no body) or POST JSON to `/api/workspaces/:id/stock-counts{path}`. */
export async function stockCountCall<T>(
  fetchFn: FetchFn,
  ws: string,
  path: string,
  body?: unknown
): Promise<T> {
  const init: RequestInit =
    body === undefined
      ? { method: 'GET', credentials: 'same-origin' }
      : {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        };
  const url = `/api/workspaces/${encodeURIComponent(ws)}/stock-counts${path}`;
  const res = await fetchFn(url, init);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return data as T;
  const code = data['errorCode'];
  throw new StockCountClientError(
    res.status,
    typeof code === 'string' ? code : 'STOCK_COUNT_FAILED',
    MESSAGES[res.status] ?? GENERIC
  );
}
export const sid = (sessionId: string) => `/${encodeURIComponent(sessionId)}`;

/** GET sessions, optionally filtered by status (e.g. counting, submitted). */
export async function listStockCounts(
  ws: string,
  statuses: StockCountStatusWire[] = [],
  fetchFn: FetchFn = fetch
): Promise<StockCountListItemView[]> {
  const q = statuses.length > 0 ? `?status=${statuses.join(',')}` : '';
  const data = await stockCountCall<{ sessions?: unknown }>(fetchFn, ws, q);
  return Array.isArray(data.sessions)
    ? (data.sessions as StockCountListItemView[])
    : [];
}

/** POST start a session (snapshot taken server-side). */
export function startStockCount(
  ws: string,
  body: StartStockCountBody,
  fetchFn: FetchFn = fetch
): Promise<Session & { lineCount: number }> {
  return stockCountCall(fetchFn, ws, '', body);
}

/** GET session detail (Rp values only present for Manager/Admin). */
export function getStockCount(
  ws: string,
  sessionId: string,
  fetchFn: FetchFn = fetch
): Promise<StockCountDetailView> {
  return stockCountCall(fetchFn, ws, sid(sessionId));
}
