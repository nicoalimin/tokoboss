/**
 * Shared access helpers for US20 integration Route Handlers (RFC 04 task
 * 83). `admitIntegrationMember` runs the RFC 02 membership gate first
 * (`requireWorkspaceMember`: 401 / neutral 404), then the role gate for the
 * requested access (403 ROLE_FORBIDDEN): `status` = every member,
 * `listing` = Admin or Manager, `write` = Admin only. The use cases re-check
 * the role and own CONNECTION_NOT_FOUND / PROVIDER_NOT_AVAILABLE.
 */
import {
  INTEGRATION_LISTING_READ_ROLES,
  INTEGRATION_STATUS_READ_ROLES,
  INTEGRATION_WRITE_ROLES,
  integrationErrorStatus,
  integrationRoleForbidden,
  toContext,
  type WorkspaceContext,
  type WorkspaceRole,
} from '@tokoboss/application';
import { slideSessionCookie } from '@/lib/auth';
import { authJson } from '@/lib/auth-routes';
import {
  WORKSPACE_NOT_AVAILABLE_DENIAL,
  requireWorkspaceMember,
  type WorkspaceMemberDenial,
} from '@/lib/workspace-access';

export type IntegrationAccess = 'status' | 'listing' | 'write';

const ACCESS_ROLES: Record<IntegrationAccess, readonly WorkspaceRole[]> = {
  status: INTEGRATION_STATUS_READ_ROLES,
  listing: INTEGRATION_LISTING_READ_ROLES,
  write: INTEGRATION_WRITE_ROLES,
};

export type IntegrationDenial =
  | WorkspaceMemberDenial
  | { status: 403; error: string; errorCode: 'ROLE_FORBIDDEN' };

export type IntegrationAdmission =
  | { ok: true; ctx: WorkspaceContext; cookie: string | undefined }
  | { ok: false; denial: IntegrationDenial };

export type RouteIds = [requestId: string, correlationId: string];

/** Membership (401 / 404) first, then the role for `access` (403). */
export async function admitIntegrationMember(
  request: Request,
  workspaceId: string,
  access: IntegrationAccess
): Promise<IntegrationAdmission> {
  const member = await requireWorkspaceMember(request, workspaceId);
  if (!member.ok) return { ok: false, denial: member.denial };
  const ctx = toContext(member.value.membership);
  if (!ACCESS_ROLES[access].includes(ctx.role)) {
    const error = integrationRoleForbidden().message;
    return {
      ok: false,
      denial: { status: 403, error, errorCode: 'ROLE_FORBIDDEN' },
    };
  }
  return { ok: true, ctx, cookie: slideSessionCookie(member.value.validated) };
}

export function integrationDenied(denial: IntegrationDenial, ids: RouteIds) {
  const { status, error, errorCode } = denial;
  return authJson({ error, errorCode }, status, ...ids);
}

/**
 * Render a thrown use-case error. Integration codes keep their status and
 * client-safe message; TENANCY_FORBIDDEN is the neutral 404; anything else
 * is a 500 that never leaks the error message.
 */
export function integrationFailed(
  err: unknown,
  ids: RouteIds,
  fallback: string
) {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === 'TENANCY_FORBIDDEN') {
    return integrationDenied(WORKSPACE_NOT_AVAILABLE_DENIAL, ids);
  }
  const status = integrationErrorStatus(err);
  if (status === 500 || !(err instanceof Error)) {
    return authJson(
      { error: fallback, errorCode: 'INTEGRATION_FAILED' },
      500,
      ...ids
    );
  }
  return authJson({ error: err.message, errorCode: code }, status, ...ids);
}
