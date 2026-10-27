/**
 * Shared Route Handler helpers for `sku-mappings/…` routes (UTA-40 /
 * US03, RFC 05 task 25b). Mirrors `@/lib/stock-count-routes`.
 *
 * - `admitSkuMappingMember` runs the RFC 02 membership gate
 *   (`requireWorkspaceMember`: 401 / neutral 404 WORKSPACE_NOT_AVAILABLE)
 *   and builds the caller's `WorkspaceContext` (GET: any member).
 * - `requireSkuMappingEditor` adds the write gate: Staff → 403
 *   TENANCY_FORBIDDEN before the body is read (POST / DELETE). The use
 *   cases re-check the role (assertSkuMappingWrite).
 * - `skuMappingDenied` / `skuMappingInvalid` / `skuMappingFailed` render
 *   JSON errors with request/correlation ids; 409/422 bodies carry the
 *   error details (remap prompt, offending Store SKUs); 500s never leak.
 */
import { toContext, type WorkspaceContext } from '@tokoboss/application';
import { slideSessionCookie } from '@/lib/auth';
import { authJson } from '@/lib/auth-routes';
import { skuMappingErrorStatus } from '@/lib/sku-mappings';
import {
  requireWorkspaceMember,
  type WorkspaceMemberDenial,
} from '@/lib/workspace-access';

export type RouteIds = [requestId: string, correlationId: string];

export type SkuMappingDenial =
  | WorkspaceMemberDenial
  | { status: 403; error: string; errorCode: 'TENANCY_FORBIDDEN' };

export type SkuMappingAdmission =
  | { ok: true; ctx: WorkspaceContext; cookie: string | undefined }
  | { ok: false; denial: SkuMappingDenial };

const EDITOR_DENIAL = {
  status: 403,
  error: 'Only Admin or Manager can change SKU mappings',
  errorCode: 'TENANCY_FORBIDDEN',
} as const satisfies SkuMappingDenial;

export async function admitSkuMappingMember(
  request: Request,
  workspaceId: string
): Promise<SkuMappingAdmission> {
  const member = await requireWorkspaceMember(request, workspaceId);
  if (!member.ok) return { ok: false, denial: member.denial };
  return {
    ok: true,
    ctx: toContext(member.value.membership),
    cookie: slideSessionCookie(member.value.validated),
  };
}

/** Admin / Manager only; Staff → 403 TENANCY_FORBIDDEN. */
export async function requireSkuMappingEditor(
  request: Request,
  workspaceId: string
): Promise<SkuMappingAdmission> {
  const admitted = await admitSkuMappingMember(request, workspaceId);
  if (!admitted.ok) return admitted;
  const { role } = admitted.ctx;
  if (role !== 'admin' && role !== 'manager') {
    return { ok: false, denial: EDITOR_DENIAL };
  }
  return admitted;
}

export function skuMappingDenied(denial: SkuMappingDenial, ids: RouteIds) {
  const { status, error, errorCode } = denial;
  return authJson({ error, errorCode }, status, ...ids);
}

export function skuMappingInvalid(ids: RouteIds) {
  const body = {
    error: 'Invalid request.',
    errorCode: 'SKU_MAPPING_VALIDATION',
  };
  return authJson(body, 400, ...ids);
}

export function skuMappingFailed(
  err: unknown,
  ids: RouteIds,
  fallback: string
) {
  const { status, errorCode } = skuMappingErrorStatus(err);
  if (status === 500)
    return authJson({ error: fallback, errorCode }, 500, ...ids);
  const error = err instanceof Error ? err.message : fallback;
  const details = (err as { details?: unknown }).details;
  const body =
    details === undefined
      ? { error, errorCode }
      : { error, errorCode, details };
  return authJson(body, status, ...ids);
}
