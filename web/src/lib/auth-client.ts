/**
 * Browser client for the UTA-67 auth Route Handlers (UTA-69).
 *
 * - Web sessions ride the HttpOnly `tb_session` cookie (`credentials:
 *   "same-origin"`), so opaque tokens are never kept in JS variables,
 *   browser storage, or logs. Only the mobile bearer flow returns a token, and this client
 *   never uses it.
 * - Errors are normalized to client-safe messages: sign-in failures always
 *   surface the generic "Invalid email or password." shape (no enumeration),
 *   and thrown errors never echo the email or password.
 * - `needsReauth` flags 401 `INVALID_SESSION` so pages can redirect to
 *   `/sign-in?expired=1` (30m web idle re-auth; no absolute-expiry copy).
 */

import { getAuthCopy, type AuthLang } from './auth-copy';

export interface SessionView {
  id: string;
  platform: 'web' | 'mobile';
  deviceLabel: string | null;
  authVersion: number;
  lastSeenAt: string;
  createdAt: string;
}

export interface SignInInput {
  email: string;
  password: string;
  workspaceId: string;
}

export interface SignInResult {
  session: SessionView;
  userId: string;
  workspaceId: string;
}

export class AuthClientError extends Error {
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
    this.name = 'AuthClientError';
    this.status = opts.status;
    this.errorCode = opts.errorCode;
    this.needsReauth = opts.needsReauth ?? false;
  }
}

type FetchFn = typeof fetch;

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
export function toAuthClientError(
  status: number,
  body: Record<string, unknown>,
  lang: AuthLang = 'en'
): AuthClientError {
  const copy = getAuthCopy(lang);
  const code =
    typeof body['errorCode'] === 'string' ? body['errorCode'] : 'AUTH_FAILED';
  if (status === 401 && code === 'INVALID_SESSION') {
    return new AuthClientError({
      status,
      errorCode: code,
      message: copy.expiredNotice,
      needsReauth: true,
    });
  }
  if (status === 401) {
    // Unknown email, wrong password, missing/deactivated membership, and
    // bad workspace all collapse here — no enumeration oracle.
    return new AuthClientError({
      status,
      errorCode: 'INVALID_CREDENTIALS',
      message: copy.genericSignInError,
    });
  }
  if (status === 429) {
    return new AuthClientError({
      status,
      errorCode: 'RATE_LIMITED',
      message: copy.rateLimitedError,
    });
  }
  if (status === 400 && code === 'PASSWORD_POLICY') {
    const detail =
      typeof body['error'] === 'string' && body['error'].length > 0
        ? body['error']
        : copy.validationError;
    // Server policy detail is client-safe by contract; still cap length.
    return new AuthClientError({
      status,
      errorCode: code,
      message: detail.slice(0, 200),
    });
  }
  if (status === 400) {
    return new AuthClientError({
      status,
      errorCode: code,
      message: copy.validationError,
    });
  }
  return new AuthClientError({
    status,
    errorCode: code,
    message: copy.genericSignInError,
  });
}

async function postJson<T>(
  fetchFn: FetchFn,
  path: string,
  payload: unknown,
  lang: AuthLang
): Promise<T> {
  const res = await fetchFn(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw toAuthClientError(res.status, await readBody(res), lang);
  return (await res.json()) as T;
}

/** Sign in on web. The session is set as an HttpOnly cookie; no token kept. */
export async function signIn(
  input: SignInInput,
  opts: { fetchFn?: FetchFn; lang?: AuthLang } = {}
): Promise<SignInResult> {
  const data = await postJson<{
    session: SessionView;
    userId: string;
    workspaceId: string;
  }>(
    opts.fetchFn ?? fetch,
    '/api/auth/sign-in',
    { ...input, platform: 'web' },
    opts.lang ?? 'en'
  );
  return {
    session: data.session,
    userId: data.userId,
    workspaceId: data.workspaceId,
  };
}

/** Sign out this device (clears the HttpOnly cookie server-side). */
export async function signOut(
  opts: {
    fetchFn?: FetchFn;
    lang?: AuthLang;
  } = {}
): Promise<void> {
  await postJson<unknown>(
    opts.fetchFn ?? fetch,
    '/api/auth/sign-out',
    {},
    opts.lang ?? 'en'
  );
}

/** Revoke every session for the user (sign out all devices). */
export async function signOutAll(
  opts: {
    fetchFn?: FetchFn;
    lang?: AuthLang;
  } = {}
): Promise<{ revokedCount: number }> {
  const data = await postJson<{ revokedCount: number }>(
    opts.fetchFn ?? fetch,
    '/api/auth/sign-out-all',
    {},
    opts.lang ?? 'en'
  );
  return { revokedCount: data.revokedCount ?? 0 };
}

/** List active sessions (client-safe projections; no hashes/tokens). */
export async function listSessions(
  opts: {
    fetchFn?: FetchFn;
    lang?: AuthLang;
  } = {}
): Promise<SessionView[]> {
  const fetchFn = opts.fetchFn ?? fetch;
  const res = await fetchFn('/api/auth/sessions', {
    credentials: 'same-origin',
  });
  if (!res.ok)
    throw toAuthClientError(res.status, await readBody(res), opts.lang ?? 'en');
  const data = (await res.json()) as { sessions?: SessionView[] };
  return Array.isArray(data.sessions) ? data.sessions : [];
}

/** Request a password-reset ticket. Always the same generic success shape. */
export async function requestPasswordReset(
  email: string,
  opts: { fetchFn?: FetchFn; lang?: AuthLang } = {}
): Promise<{ message: string }> {
  const copy = getAuthCopy(opts.lang ?? 'en');
  await postJson<unknown>(
    opts.fetchFn ?? fetch,
    '/api/auth/password-reset/request',
    { email },
    opts.lang ?? 'en'
  );
  return { message: copy.forgotDone };
}

/** Confirm a reset with the single-use ticket (from email / fixture). */
export async function confirmPasswordReset(
  input: { resetToken: string; newPassword: string },
  opts: { fetchFn?: FetchFn; lang?: AuthLang } = {}
): Promise<void> {
  await postJson<unknown>(
    opts.fetchFn ?? fetch,
    '/api/auth/password-reset/confirm',
    input,
    opts.lang ?? 'en'
  );
}
