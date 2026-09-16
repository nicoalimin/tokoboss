/**
 * Browser client for the UTA-70 invite/membership Route Handlers (UTA-71).
 *
 * - Web sessions ride the HttpOnly `tb_session` cookie (`credentials:
 *   "same-origin"`), so opaque invite tokens are never kept in JS variables,
 *   browser storage, or logs — except the single create-response ticket the
 *   Admin copies out of band (email provider polish is out of scope).
 * - Errors are normalized to client-safe messages via `getTeamCopy`: server
 *   messages pass through only when they are known-safe (last-Admin,
 *   invite invalid/expired); everything else maps to generic copy so PII or
 *   token material can never leak into the UI.
 * - `needsReauth` flags 401 `INVALID_SESSION` so pages can redirect to
 *   `/sign-in?expired=1` (30m web idle re-auth).
 */

import { getTeamCopy, type TeamLang } from './team-copy';

export type WorkspaceRole = 'admin' | 'manager' | 'staff';

export interface MemberView {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  warehouseScope: string | null;
  status: 'active' | 'deactivated';
  authVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface InviteView {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  warehouseScope: string | null;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: string;
  invitedBy: string | null;
  acceptedAt: string | null;
  createdAt: string;
}

export interface MyMembershipView {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  warehouseScope: string | null;
  status: 'active' | 'deactivated';
}

export interface CreateInviteInput {
  email: string;
  role: WorkspaceRole;
  warehouseScope?: string | null;
}

export interface UpdateMemberInput {
  role?: WorkspaceRole;
  warehouseScope?: string | null;
}

export interface AcceptInviteInput {
  token: string;
  newPassword?: string;
}

export class TeamClientError extends Error {
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
    this.name = 'TeamClientError';
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

/** Map a failing response to a client-safe error (never echoes PII). */
export function toTeamClientError(
  status: number,
  body: Record<string, unknown>,
  lang: TeamLang = 'en'
): TeamClientError {
  const copy = getTeamCopy(lang);
  const code =
    typeof body['errorCode'] === 'string' ? body['errorCode'] : 'TEAM_FAILED';
  if (status === 401 && code === 'INVALID_SESSION') {
    return new TeamClientError({
      status,
      errorCode: code,
      message: copy.expiredNotice,
      needsReauth: true,
    });
  }
  if (status === 401) {
    return new TeamClientError({
      status,
      errorCode: code,
      message: copy.expiredNotice,
      needsReauth: true,
    });
  }
  if (status === 403) {
    return new TeamClientError({
      status,
      errorCode: 'TENANCY_FORBIDDEN',
      message: copy.forbiddenError,
    });
  }
  if (status === 409 && code === 'TENANCY_LAST_ADMIN') {
    return new TeamClientError({
      status,
      errorCode: code,
      message: copy.lastAdminError,
    });
  }
  if (
    status === 409 &&
    (code === 'INVITE_CONFLICT' || code === 'MEMBERSHIP_CONFLICT')
  ) {
    return new TeamClientError({
      status,
      errorCode: code,
      message: copy.inviteConflictError,
    });
  }
  if (status === 404 && code === 'INVITE_INVALID') {
    return new TeamClientError({
      status,
      errorCode: code,
      message: copy.inviteInvalidError,
    });
  }
  if (status === 410 && code === 'INVITE_EXPIRED') {
    return new TeamClientError({
      status,
      errorCode: code,
      message: copy.inviteExpiredError,
    });
  }
  if (status === 400) {
    return new TeamClientError({
      status,
      errorCode: code,
      message: copy.validationError,
    });
  }
  return new TeamClientError({
    status,
    errorCode: code,
    message: copy.genericError,
  });
}

/**
 * Client-side guard for the Admin-must-be-unscoped rule (UTA-70). The server
 * enforces it again; this only yields the faster inline message.
 */
export function validateScopeForRole(
  role: WorkspaceRole,
  warehouseScope: string | null | undefined
): boolean {
  if (
    role === 'admin' &&
    warehouseScope !== null &&
    warehouseScope !== undefined &&
    warehouseScope !== ''
  ) {
    return false;
  }
  return true;
}

/** Count active Admins in a member list (drives the last-Admin lock). */
export function countActiveAdmins(members: MemberView[]): number {
  return members.filter((m) => m.role === 'admin' && m.status === 'active')
    .length;
}

/**
 * True when `userId` is the workspace's sole active Admin.
 *
 * The Team UI binds `disabled` on that row's demote/deactivate controls to
 * this predicate (UTA-71 review) — the server 409 (`TENANCY_LAST_ADMIN`)
 * remains the authority for stale lists or direct API callers.
 */
export function isLastActiveAdmin(
  members: MemberView[],
  userId: string
): boolean {
  const target = members.find((m) => m.userId === userId);
  if (!target || target.role !== 'admin' || target.status !== 'active') {
    return false;
  }
  return countActiveAdmins(members) <= 1;
}

/** Normalize the scope input: empty string → null (unscoped). */
export function normalizeScope(
  value: string | null | undefined
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

async function getJson<T>(
  fetchFn: FetchFn,
  path: string,
  lang: TeamLang
): Promise<T> {
  const res = await fetchFn(path, { credentials: 'same-origin' });
  if (!res.ok) throw toTeamClientError(res.status, await readBody(res), lang);
  return (await res.json()) as T;
}

async function sendJson<T>(
  fetchFn: FetchFn,
  path: string,
  method: string,
  payload: unknown,
  lang: TeamLang
): Promise<T> {
  const res = await fetchFn(path, {
    method,
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw toTeamClientError(res.status, await readBody(res), lang);
  return (await res.json()) as T;
}

async function sendNoBody<T>(
  fetchFn: FetchFn,
  path: string,
  method: string,
  lang: TeamLang
): Promise<T> {
  const res = await fetchFn(path, { method, credentials: 'same-origin' });
  if (!res.ok) throw toTeamClientError(res.status, await readBody(res), lang);
  return (await res.json()) as T;
}

export async function listMembers(
  workspaceId: string,
  opts: { fetchFn?: FetchFn; lang?: TeamLang } = {}
): Promise<MemberView[]> {
  const data = await getJson<{ members?: MemberView[] }>(
    opts.fetchFn ?? fetch,
    `/api/workspaces/${encodeSegment(workspaceId)}/members`,
    opts.lang ?? 'en'
  );
  return Array.isArray(data.members) ? data.members : [];
}

export async function listInvites(
  workspaceId: string,
  opts: { fetchFn?: FetchFn; lang?: TeamLang } = {}
): Promise<InviteView[]> {
  const data = await getJson<{ invites?: InviteView[] }>(
    opts.fetchFn ?? fetch,
    `/api/workspaces/${encodeSegment(workspaceId)}/invites`,
    opts.lang ?? 'en'
  );
  return Array.isArray(data.invites) ? data.invites : [];
}

export async function createInvite(
  workspaceId: string,
  input: CreateInviteInput,
  opts: { fetchFn?: FetchFn; lang?: TeamLang } = {}
): Promise<{ invite: InviteView; token: string }> {
  return sendJson<{ invite: InviteView; token: string }>(
    opts.fetchFn ?? fetch,
    `/api/workspaces/${encodeSegment(workspaceId)}/invites`,
    'POST',
    {
      email: input.email,
      role: input.role,
      warehouseScope: normalizeScope(input.warehouseScope),
    },
    opts.lang ?? 'en'
  );
}

export async function revokeInvite(
  workspaceId: string,
  inviteId: string,
  opts: { fetchFn?: FetchFn; lang?: TeamLang } = {}
): Promise<void> {
  await sendNoBody<unknown>(
    opts.fetchFn ?? fetch,
    `/api/workspaces/${encodeSegment(workspaceId)}/invites/${encodeSegment(inviteId)}`,
    'DELETE',
    opts.lang ?? 'en'
  );
}

export async function updateMember(
  workspaceId: string,
  userId: string,
  input: UpdateMemberInput,
  opts: { fetchFn?: FetchFn; lang?: TeamLang } = {}
): Promise<MemberView> {
  const payload: Record<string, unknown> = {};
  if (input.role !== undefined) payload['role'] = input.role;
  if (input.warehouseScope !== undefined)
    payload['warehouseScope'] = normalizeScope(input.warehouseScope);
  const data = await sendJson<{ member: MemberView }>(
    opts.fetchFn ?? fetch,
    `/api/workspaces/${encodeSegment(workspaceId)}/members/${encodeSegment(userId)}`,
    'PATCH',
    payload,
    opts.lang ?? 'en'
  );
  return data.member;
}

export async function deactivateMember(
  workspaceId: string,
  userId: string,
  opts: { fetchFn?: FetchFn; lang?: TeamLang } = {}
): Promise<MemberView> {
  const data = await sendJson<{ member: MemberView }>(
    opts.fetchFn ?? fetch,
    `/api/workspaces/${encodeSegment(workspaceId)}/members/${encodeSegment(userId)}/deactivate`,
    'POST',
    {},
    opts.lang ?? 'en'
  );
  return data.member;
}

/**
 * Read the caller's own membership in the session workspace (UTA-74).
 *
 * Any signed-in member may call this (Manager/Staff included) — it backs
 * the role-gated shell. 401 maps to re-auth; 403 (no live membership) maps
 * to the generic access copy. Responses carry opaque ids only.
 */
export async function getMyMembership(
  opts: { fetchFn?: FetchFn; lang?: TeamLang } = {}
): Promise<MyMembershipView> {
  const data = await getJson<{ membership: MyMembershipView }>(
    opts.fetchFn ?? fetch,
    '/api/auth/membership',
    opts.lang ?? 'en'
  );
  return data.membership;
}

export async function acceptInvite(
  input: AcceptInviteInput,
  opts: { fetchFn?: FetchFn; lang?: TeamLang } = {}
): Promise<{ member: MemberView; userId: string; workspaceId: string }> {
  const payload: Record<string, unknown> = { token: input.token };
  if (input.newPassword) payload['newPassword'] = input.newPassword;
  return sendJson<{ member: MemberView; userId: string; workspaceId: string }>(
    opts.fetchFn ?? fetch,
    '/api/invites/accept',
    'POST',
    payload,
    opts.lang ?? 'en'
  );
}
