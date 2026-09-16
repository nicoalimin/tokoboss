/**
 * Browser client for the UTA-79 bundle/BOM Route Handlers (UTA-80, Story 13 web).
 *
 * - Web sessions ride the HttpOnly `tb_session` cookie (`credentials:
 *   "same-origin"`), so no tokens, workspace secrets, or PII are kept in JS
 *   variables, browser storage, or logs.
 * - Errors are normalized to client-safe messages via `getBundlesCopy`:
 *   cycle / self-reference (`BUNDLE_CYCLE`), duplicate BOM
 *   (`BUNDLE_CONFLICT`), stale versions (`BUNDLE_VERSION_CONFLICT`),
 *   and bundle stock (`BUNDLE_NO_DIRECT_STOCK`) surface honest sentences;
 *   everything else maps to generic copy. Thrown errors never echo SKUs,
 *   quantities, reasons, or ids.
 * - `needsReauth` flags 401 `INVALID_SESSION` so pages can redirect to
 *   `/sign-in?expired=1` (30m web idle re-auth).
 */

import { getBundlesCopy, type BundlesLang } from './bundles-copy';

export interface BundleLineWire {
  id: string;
  workspaceId: string;
  bundleVariantId: string;
  componentVariantId: string;
  qty: number;
  createdAt: string;
  updatedAt: string;
}

export interface BundleAvailabilityWire {
  warehouseId: string;
  available: number;
}

export interface BundleComponentWire {
  line: BundleLineWire;
  componentSkuCode: string;
  componentName: string | null;
  componentStatus: 'active' | 'archived';
}

export interface BundleWire {
  bundleVariantId: string;
  workspaceId: string;
  skuCode: string;
  status: 'active' | 'archived';
  version: number;
  components: BundleComponentWire[];
  availability: BundleAvailabilityWire[];
}

export interface BundleComponentInput {
  componentVariantId: string;
  qty: number;
}

export class BundleClientError extends Error {
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
    this.name = 'BundleClientError';
    this.status = opts.status;
    this.errorCode = opts.errorCode;
    this.needsReauth = opts.needsReauth ?? false;
  }
}

type FetchFn = typeof fetch;

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

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
export function toBundleClientError(
  status: number,
  body: Record<string, unknown>,
  lang: BundlesLang = 'en'
): BundleClientError {
  const copy = getBundlesCopy(lang);
  const code =
    typeof body['errorCode'] === 'string'
      ? body['errorCode']
      : 'BUNDLE_FAILED';
  if (status === 401) {
    return new BundleClientError({
      status,
      errorCode: code,
      message: copy.expiredNotice,
      needsReauth: code === 'INVALID_SESSION',
    });
  }
  if (status === 403) {
    return new BundleClientError({
      status,
      errorCode: 'TENANCY_FORBIDDEN',
      message: copy.forbiddenError,
    });
  }
  if (status === 404) {
    return new BundleClientError({
      status,
      errorCode: code,
      message: copy.notFoundError,
    });
  }
  if (status === 409 && code === 'BUNDLE_CONFLICT') {
    return new BundleClientError({
      status,
      errorCode: code,
      message: copy.conflictError,
    });
  }
  if (status === 409 && code === 'BUNDLE_VERSION_CONFLICT') {
    return new BundleClientError({
      status,
      errorCode: code,
      message: copy.versionConflictError,
    });
  }
  if (status === 422 && code === 'BUNDLE_CYCLE') {
    return new BundleClientError({
      status,
      errorCode: code,
      message: copy.cycleError,
    });
  }
  if (status === 422 && code === 'BUNDLE_NO_DIRECT_STOCK') {
    return new BundleClientError({
      status,
      errorCode: code,
      message: copy.noDirectStockError,
    });
  }
  if (status === 400 || status === 422) {
    return new BundleClientError({
      status,
      errorCode: code,
      message: copy.validationError,
    });
  }
  return new BundleClientError({
    status,
    errorCode: code,
    message: copy.genericError,
  });
}

async function getJson<T>(
  fetchFn: FetchFn,
  path: string,
  lang: BundlesLang
): Promise<T> {
  const res = await fetchFn(path, { credentials: 'same-origin' });
  if (!res.ok) throw toBundleClientError(res.status, await readBody(res), lang);
  return (await res.json()) as T;
}

async function sendJson<T>(
  fetchFn: FetchFn,
  path: string,
  method: string,
  payload: unknown,
  lang: BundlesLang
): Promise<T> {
  const res = await fetchFn(path, {
    method,
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw toBundleClientError(res.status, await readBody(res), lang);
  return (await res.json()) as T;
}

function base(workspaceId: string): string {
  return `/api/workspaces/${encodeSegment(workspaceId)}/catalog/bundles`;
}

export interface ClientOpts {
  fetchFn?: FetchFn;
  lang?: BundlesLang;
}

/** List bundle BOMs with component lines (any active member). */
export async function listBundles(
  workspaceId: string,
  opts: ClientOpts = {}
): Promise<BundleWire[]> {
  const data = await getJson<{ bundles?: BundleWire[] }>(
    opts.fetchFn ?? fetch,
    base(workspaceId),
    opts.lang ?? 'en'
  );
  return Array.isArray(data.bundles) ? data.bundles : [];
}

/** Bundle detail with components + per-warehouse availability. */
export async function getBundle(
  workspaceId: string,
  bundleVariantId: string,
  opts: ClientOpts = {}
): Promise<BundleWire> {
  const data = await getJson<{ bundle: BundleWire }>(
    opts.fetchFn ?? fetch,
    `${base(workspaceId)}/${encodeSegment(bundleVariantId)}`,
    opts.lang ?? 'en'
  );
  return data.bundle;
}

/** Define the BOM of a bundle variant (Manager/Admin). */
export async function createBundle(
  workspaceId: string,
  input: {
    bundleVariantId: string;
    components: BundleComponentInput[];
    expectedVersion: number;
  },
  opts: ClientOpts = {}
): Promise<BundleWire> {
  const data = await sendJson<{ bundle: BundleWire }>(
    opts.fetchFn ?? fetch,
    base(workspaceId),
    'POST',
    {
      bundleVariantId: input.bundleVariantId,
      components: input.components,
      expectedVersion: input.expectedVersion,
    },
    opts.lang ?? 'en'
  );
  return data.bundle;
}

/** Replace the full BOM of a bundle variant (Manager/Admin). */
export async function updateBundle(
  workspaceId: string,
  bundleVariantId: string,
  input: { components: BundleComponentInput[]; expectedVersion: number },
  opts: ClientOpts = {}
): Promise<BundleWire> {
  const data = await sendJson<{ bundle: BundleWire }>(
    opts.fetchFn ?? fetch,
    `${base(workspaceId)}/${encodeSegment(bundleVariantId)}`,
    'PATCH',
    { components: input.components, expectedVersion: input.expectedVersion },
    opts.lang ?? 'en'
  );
  return data.bundle;
}

/** Archive a bundle BOM — clears every line (Manager/Admin, idempotent). */
export async function archiveBundle(
  workspaceId: string,
  bundleVariantId: string,
  input: { expectedVersion: number },
  opts: ClientOpts = {}
): Promise<BundleWire> {
  const data = await sendJson<{ bundle: BundleWire }>(
    opts.fetchFn ?? fetch,
    `${base(workspaceId)}/${encodeSegment(bundleVariantId)}/archive`,
    'POST',
    { expectedVersion: input.expectedVersion },
    opts.lang ?? 'en'
  );
  return data.bundle;
}
