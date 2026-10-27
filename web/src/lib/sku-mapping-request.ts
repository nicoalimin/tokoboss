/**
 * Shared request helper for the US03 SKU mapping browser client (UTA-40,
 * RFC 05 task 31a): path builder, same-origin JSON call and the typed
 * client error. The five calls (31b) live in `sku-mapping-client.ts`.
 *
 * - The session rides the HttpOnly `tb_session` cookie (`credentials:
 *   'same-origin'`); no tokens are kept in JS or storage.
 * - Route errors are English and developer-facing, so thrown errors carry
 *   client-safe Bahasa Indonesia copy keyed by `errorCode` (then status)
 *   and never echo SKUs or ids. 409/422 `details` pass through for the
 *   remap prompt and ambiguous review. 401 sets `needsReauth`.
 */
export type FetchFn = typeof fetch;

const BY_CODE: Record<string, string> = {
  SKU_MAPPING_ALREADY_ASSIGNED:
    'Store SKU ini sudah dipetakan ke SKU TokoBoss lain.',
  CATALOG_VERSION_CONFLICT:
    'Pemetaan sudah diubah orang lain. Muat ulang lalu coba lagi.',
  SKU_MAPPING_AMBIGUOUS_REQUIRES_REVIEW:
    'Ada kecocokan ambigu. Tinjau dan pilih SKU TokoBoss secara manual.',
  SKU_MAPPING_VARIANT_ARCHIVED: 'SKU TokoBoss ini sudah diarsipkan.',
};
const BY_STATUS: Record<number, string> = {
  400: 'Data tidak valid. Periksa lagi pilihannya.',
  401: 'Sesi kamu sudah habis. Silakan masuk lagi.',
  403: 'Hanya Admin atau Manajer yang bisa mengubah pemetaan.',
  404: 'Data tidak ditemukan.',
};
export const SKU_MAPPING_GENERIC_ERROR =
  'Terjadi kesalahan. Coba lagi sebentar lagi.';

export class SkuMappingClientError extends Error {
  readonly status: number;
  readonly errorCode: string;
  readonly needsReauth: boolean;
  readonly details: unknown;
  constructor(status: number, errorCode: string, details?: unknown) {
    super(BY_CODE[errorCode] ?? BY_STATUS[status] ?? SKU_MAPPING_GENERIC_ERROR);
    this.name = 'SkuMappingClientError';
    this.status = status;
    this.errorCode = errorCode;
    this.needsReauth = status === 401;
    this.details = details;
  }
}

/** `/api/workspaces/:workspaceId/sku-mappings[/...segments][?query]`. */
export function skuMappingsPath(
  workspaceId: string,
  segments: string[] = [],
  query: Record<string, string | number | undefined> = {}
): string {
  const base = `/api/workspaces/${encodeURIComponent(workspaceId)}/sku-mappings`;
  const path = [base, ...segments.map((s) => encodeURIComponent(s))].join('/');
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/** One same-origin JSON call; a non-2xx response throws the client error. */
export async function skuMappingRequest<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
  fetchFn: FetchFn = fetch
): Promise<T> {
  const res = await fetchFn(path, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    ...(init.body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(init.body),
        }),
  });
  let data: Record<string, unknown> = {};
  try {
    const parsed = (await res.json()) as unknown;
    if (parsed && typeof parsed === 'object') {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    // Non-JSON (proxies, empty 500s) → generic message.
  }
  if (!res.ok) {
    const code = data['errorCode'];
    throw new SkuMappingClientError(
      res.status,
      typeof code === 'string' ? code : 'SKU_MAPPING_FAILED',
      data['details']
    );
  }
  return data as T;
}
