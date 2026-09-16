/**
 * Browser client for the UTA-77 product import Route Handlers (UTA-78,
 * Story 02 web).
 *
 * - Web sessions ride the HttpOnly `tb_session` cookie (`credentials:
 *   "same-origin"`), so no tokens, workspace secrets, or PII are kept in JS
 *   variables, browser storage, or logs.
 * - Errors are normalized to client-safe messages via `getImportsCopy`:
 *   server messages pass through only for duplicate guidance (the
 *   `existingPath` is an opaque route, never raw ids); everything else maps
 *   to generic copy. Thrown errors never echo SKUs, prices, reasons, or ids.
 * - `needsReauth` flags 401 `INVALID_SESSION` so pages can redirect to
 *   `/sign-in?expired=1` (30m web idle re-auth).
 * - No live marketplace calls: every function hits the workspace-scoped
 *   import routes only; Store SKU text is surfaced as a mapping candidate
 *   and never sent anywhere else.
 */

import type {
  ConfirmImportResultView,
  ImportBatchView,
  ImportRowView,
} from '@tokoboss/contracts';
import { getImportsCopy, type ImportsLang } from './imports-copy';

export type { ConfirmImportResultView, ImportBatchView, ImportRowView };

export interface UploadCsvInput {
  filename: string;
  content: string;
  contentType?: string;
}

export interface UploadRowsInput {
  filename: string;
  rows: Array<Record<string, unknown>>;
  contentType?: string;
}

export interface PatchRowInput {
  productName?: string;
  skuCode?: string;
  variantName?: string | null;
  barcode?: string | null;
  sellingPriceCents?: number;
  currency?: string;
  hppCents?: number | null;
  costSource?: string | null;
  listingName?: string | null;
  unit?: string;
  channel?: string | null;
  shopExtId?: string | null;
  platformSkuId?: string | null;
  sellerSkuHint?: string | null;
  status?: 'rejected';
  note?: string | null;
}

export interface ConfirmSummary {
  applied: ConfirmImportResultView['applied'];
  duplicates: ConfirmImportResultView['duplicates'];
  skipped: ConfirmImportResultView['skipped'];
}

export class ImportsClientError extends Error {
  readonly status: number;
  readonly errorCode: string;
  readonly needsReauth: boolean;
  /** Opaque existing-catalog route for duplicates (confirm only). */
  readonly existingPath?: string;
  constructor(opts: {
    status: number;
    errorCode: string;
    message: string;
    needsReauth?: boolean;
    existingPath?: string;
  }) {
    super(opts.message);
    this.name = 'ImportsClientError';
    this.status = opts.status;
    this.errorCode = opts.errorCode;
    this.needsReauth = opts.needsReauth ?? false;
    this.existingPath = opts.existingPath;
  }
}

type FetchFn = typeof fetch;

export interface ClientOpts {
  fetchFn?: FetchFn;
  lang?: ImportsLang;
}

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

function detailsRecord(body: Record<string, unknown>): Record<string, unknown> {
  const details = body['details'];
  return details && typeof details === 'object'
    ? (details as Record<string, unknown>)
    : {};
}

/** Map a failing response to a client-safe error (never echoes PII/SKUs). */
export function toImportsClientError(
  status: number,
  body: Record<string, unknown>,
  lang: ImportsLang = 'en'
): ImportsClientError {
  const copy = getImportsCopy(lang);
  const code =
    typeof body['errorCode'] === 'string'
      ? body['errorCode']
      : 'IMPORT_FAILED';
  if (status === 401) {
    return new ImportsClientError({
      status,
      errorCode: code,
      message: copy.expiredNotice,
      needsReauth: code === 'INVALID_SESSION',
    });
  }
  if (status === 403) {
    return new ImportsClientError({
      status,
      errorCode: 'TENANCY_FORBIDDEN',
      message: copy.forbiddenError,
    });
  }
  if (status === 409 && code === 'IMPORT_CONFLICT') {
    const existingPath = detailsRecord(body)['existingPath'];
    return new ImportsClientError({
      status,
      errorCode: code,
      message: copy.genericError,
      ...(typeof existingPath === 'string' && existingPath.startsWith('/api/')
        ? { existingPath }
        : {}),
    });
  }
  if (status === 400 || status === 422) {
    return new ImportsClientError({
      status,
      errorCode: code,
      message: copy.validationError,
    });
  }
  return new ImportsClientError({
    status,
    errorCode: code,
    message: copy.genericError,
  });
}

async function getJson<T>(
  fetchFn: FetchFn,
  path: string,
  lang: ImportsLang
): Promise<T> {
  const res = await fetchFn(path, { credentials: 'same-origin' });
  if (!res.ok) throw toImportsClientError(res.status, await readBody(res), lang);
  return (await res.json()) as T;
}

async function sendJson<T>(
  fetchFn: FetchFn,
  path: string,
  method: string,
  payload: unknown,
  lang: ImportsLang
): Promise<T> {
  const res = await fetchFn(path, {
    method,
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw toImportsClientError(res.status, await readBody(res), lang);
  return (await res.json()) as T;
}

function base(workspaceId: string): string {
  return `/api/workspaces/${encodeSegment(workspaceId)}/imports`;
}

/** List import batches, newest first (any active member). */
export async function listImports(
  workspaceId: string,
  opts: ClientOpts = {}
): Promise<ImportBatchView[]> {
  const data = await getJson<{ batches?: ImportBatchView[] }>(
    opts.fetchFn ?? fetch,
    `${base(workspaceId)}?limit=50`,
    opts.lang ?? 'en'
  );
  return Array.isArray(data.batches) ? data.batches : [];
}

/** Batch detail with reviewable rows (any active member). */
export async function getImport(
  workspaceId: string,
  batchId: string,
  opts: ClientOpts = {}
): Promise<ImportBatchView> {
  const data = await getJson<{ batch: ImportBatchView }>(
    opts.fetchFn ?? fetch,
    `${base(workspaceId)}/${encodeSegment(batchId)}`,
    opts.lang ?? 'en'
  );
  return data.batch;
}

export interface UploadResult {
  batch: ImportBatchView;
  duplicate: boolean;
  jobId: string | null;
}

/** Upload CSV text for review (Manager/Admin). */
export async function uploadImportCsv(
  workspaceId: string,
  input: UploadCsvInput,
  opts: ClientOpts = {}
): Promise<UploadResult> {
  return sendJson<UploadResult>(
    opts.fetchFn ?? fetch,
    base(workspaceId),
    'POST',
    {
      filename: input.filename,
      contentType: input.contentType ?? 'text/csv',
      content: input.content,
    },
    opts.lang ?? 'en'
  );
}

/** Upload pre-parsed rows (xlsx/photo/PDF converters, Manager/Admin). */
export async function uploadImportRows(
  workspaceId: string,
  input: UploadRowsInput,
  opts: ClientOpts = {}
): Promise<UploadResult> {
  return sendJson<UploadResult>(
    opts.fetchFn ?? fetch,
    base(workspaceId),
    'POST',
    {
      filename: input.filename,
      contentType: input.contentType ?? 'application/json',
      rows: input.rows,
    },
    opts.lang ?? 'en'
  );
}

/** Edit or reject one candidate row (Manager/Admin). */
export async function patchImportRow(
  workspaceId: string,
  batchId: string,
  rowId: string,
  patch: PatchRowInput,
  opts: ClientOpts = {}
): Promise<ImportRowView> {
  const data = await sendJson<{ row: ImportRowView }>(
    opts.fetchFn ?? fetch,
    `${base(workspaceId)}/${encodeSegment(batchId)}/rows/${encodeSegment(rowId)}`,
    'PATCH',
    patch,
    opts.lang ?? 'en'
  );
  return data.row;
}

/** Reject or reopen a batch (Manager/Admin). */
export async function patchImportBatch(
  workspaceId: string,
  batchId: string,
  action: 'reject' | 'reopen',
  opts: ClientOpts = {}
): Promise<ImportBatchView> {
  const data = await sendJson<{ batch: ImportBatchView }>(
    opts.fetchFn ?? fetch,
    `${base(workspaceId)}/${encodeSegment(batchId)}`,
    'PATCH',
    { action },
    opts.lang ?? 'en'
  );
  return data.batch;
}

/**
 * Confirm-before-create (Manager/Admin).
 *
 * Creates catalog products + SKU TokoBoss rows via the UTA-75 rules.
 * Duplicates surface `existingPath` and never overwrite; the Store SKU
 * text lands as mapping candidates only.
 */
export async function confirmImport(
  workspaceId: string,
  batchId: string,
  rowIds?: string[],
  opts: ClientOpts = {}
): Promise<{ summary: ConfirmSummary; batch: ImportBatchView }> {
  return sendJson<{ summary: ConfirmSummary; batch: ImportBatchView }>(
    opts.fetchFn ?? fetch,
    `${base(workspaceId)}/${encodeSegment(batchId)}/confirm`,
    'POST',
    rowIds ? { rowIds } : {},
    opts.lang ?? 'en'
  );
}

/** Parse a rows-JSON textarea into pre-parsed row objects (client-side). */
export function parseRowsJson(text: string): {
  ok: true;
  rows: Array<Record<string, unknown>>;
} | { ok: false } {
  try {
    const data: unknown = JSON.parse(text);
    if (!Array.isArray(data) || data.length < 1 || data.length > 500) {
      return { ok: false };
    }
    for (const row of data) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        return { ok: false };
      }
      const keys = Object.keys(row as Record<string, unknown>);
      if (keys.length < 1 || keys.length > 40) return { ok: false };
    }
    return { ok: true, rows: data as Array<Record<string, unknown>> };
  } catch {
    return { ok: false };
  }
}

/** Format integer cents as whole IDR (no floats cross this boundary). */
export function formatIdr(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  return `Rp${cents.toLocaleString('id-ID')}`;
}
