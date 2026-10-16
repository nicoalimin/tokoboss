/**
 * Shared Route Handler helpers for stock-opname routes
 * (US12 / RFC 03 task 31a). Used by every `stock-counts/…` route.
 *
 * - `admitStockCountMember` runs the RFC 02 membership gate
 *   (`requireWorkspaceMember`: 401 / neutral 404) and builds the
 *   caller's `WorkspaceContext`. Role and warehouse-scope checks stay
 *   in the use cases (403 / 404 `STOCK_COUNT_NOT_FOUND`).
 * - `stockCountDenied` / `stockCountFailed` render the JSON error body
 *   with request/correlation ids; 500s never leak the error message.
 */
import { toContext, type WorkspaceContext } from '@tokoboss/application';
import { slideSessionCookie } from '@/lib/auth';
import { authJson } from '@/lib/auth-routes';
import { stockCountErrorStatus } from '@/lib/stock-count';
import {
  requireWorkspaceMember,
  type WorkspaceMemberDenial,
} from '@/lib/workspace-access';

export type RouteIds = [requestId: string, correlationId: string];

export type StockCountAdmission =
  | { ok: true; ctx: WorkspaceContext; cookie: string | undefined }
  | { ok: false; denial: WorkspaceMemberDenial };

export async function admitStockCountMember(
  request: Request,
  workspaceId: string
): Promise<StockCountAdmission> {
  const member = await requireWorkspaceMember(request, workspaceId);
  if (!member.ok) return { ok: false, denial: member.denial };
  return {
    ok: true,
    ctx: toContext(member.value.membership),
    cookie: slideSessionCookie(member.value.validated),
  };
}

export function stockCountDenied(denial: WorkspaceMemberDenial, ids: RouteIds) {
  const { status, error, errorCode } = denial;
  return authJson({ error, errorCode }, status, ...ids);
}

export function stockCountInvalid(ids: RouteIds) {
  const body = {
    error: 'Invalid request.',
    errorCode: 'STOCK_COUNT_VALIDATION',
  };
  return authJson(body, 400, ...ids);
}

export function stockCountFailed(
  err: unknown,
  ids: RouteIds,
  fallback: string
) {
  const mapped = stockCountErrorStatus(err);
  const error =
    mapped.status !== 500 && err instanceof Error ? err.message : fallback;
  return authJson(
    { error, errorCode: mapped.errorCode },
    mapped.status,
    ...ids
  );
}
