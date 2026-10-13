/**
 * US29 / RFC 02 row 30 — one membership gate for workspace route handlers.
 *
 * Validates the session (account or workspace-bound), then runs
 * `accessWorkspace` for the PATH workspace id. Every no-access case
 * (malformed/unknown id, never a member, deactivated membership,
 * deactivated workspace) returns the same neutral 404
 * `WORKSPACE_NOT_AVAILABLE`. A missing/invalid session stays 401.
 * Role checks (403) are the caller's job — see `requireWorkspaceAdmin`.
 */
import {
  accessWorkspace,
  validateSession,
  type WorkspaceMemberRecord,
} from '@tokoboss/application';
import {
  WORKSPACE_NOT_AVAILABLE_CODE,
  WORKSPACE_NOT_AVAILABLE_MESSAGE,
} from '@tokoboss/contracts';
import {
  extractTokenWithSource,
  getAuthAudit,
  getAuthDeps,
  getMemberStore,
  type ValidatedRequest,
} from '@/lib/auth';

export interface WorkspaceMemberRequest {
  membership: WorkspaceMemberRecord;
  /** `workspaceId` is the path workspace the caller was admitted to. */
  validated: ValidatedRequest;
}

export type WorkspaceMemberDenial =
  | { status: 401; error: string; errorCode: 'INVALID_SESSION' }
  | {
      status: 404;
      error: typeof WORKSPACE_NOT_AVAILABLE_MESSAGE;
      errorCode: typeof WORKSPACE_NOT_AVAILABLE_CODE;
    };

export const WORKSPACE_NOT_AVAILABLE_DENIAL = {
  status: 404,
  error: WORKSPACE_NOT_AVAILABLE_MESSAGE,
  errorCode: WORKSPACE_NOT_AVAILABLE_CODE,
} as const satisfies WorkspaceMemberDenial;

const INVALID_SESSION_DENIAL = {
  status: 401,
  error: 'Session is expired. Sign in again.',
  errorCode: 'INVALID_SESSION',
} as const satisfies WorkspaceMemberDenial;

export interface RequireWorkspaceMemberOptions {
  correlationId?: string;
  switching?: { fromWorkspaceId?: string };
}

export async function requireWorkspaceMember(
  request: Request,
  workspaceId: string,
  options: RequireWorkspaceMemberOptions = {}
): Promise<
  | { ok: true; value: WorkspaceMemberRequest }
  | { ok: false; denial: WorkspaceMemberDenial }
> {
  const source = extractTokenWithSource(request);
  const session = source
    ? await validateSession(getAuthDeps(), source.token)
    : null;
  if (!source || !session) {
    return { ok: false, denial: INVALID_SESSION_DENIAL };
  }
  const access = await accessWorkspace(
    { members: getMemberStore(), audit: getAuthAudit() },
    {
      workspaceId,
      userId: session.userId,
      sessionId: session.session.id,
      switching: options.switching,
      correlationId: options.correlationId,
    }
  );
  if (!access.ok) {
    return { ok: false, denial: WORKSPACE_NOT_AVAILABLE_DENIAL };
  }
  return {
    ok: true,
    value: {
      membership: access.membership,
      validated: {
        userId: session.userId,
        workspaceId: access.membership.workspaceId,
        authVersion: session.authVersion,
        platform: session.session.platform,
        token: source.token,
        viaCookie: source.viaCookie,
      },
    },
  };
}
