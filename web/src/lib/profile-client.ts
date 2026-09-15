/**
 * Browser client for the UTA-72 personal-profile Route Handlers (UTA-73).
 *
 * - Web sessions ride the HttpOnly session cookie (`credentials:
 *   "same-origin"`), so opaque tokens are never kept in JS variables,
 *   browser storage, or logs.
 * - Errors are normalized to client-safe messages via `getProfileCopy`:
 *   server messages pass through only when they are known-safe (password
 *   policy detail); everything else maps to generic copy so PII or secret
 *   material can never leak into the UI. Thrown errors never echo emails,
 *   display names, upload ids, or passwords.
 * - `needsReauth` flags 401 `INVALID_SESSION` so pages can redirect to
 *   `/sign-in?expired=1` (30m web idle re-auth). Password change revokes ALL
 *   sessions server-side and clears the cookie — the caller must re-auth.
 */

import { getProfileCopy, type ProfileLang } from './profile-copy';

export interface ProfileView {
  userId: string;
  email: string;
  displayName: string | null;
  avatarUploadId: string | null;
  updatedAt: string;
}

export interface UpdateProfileInput {
  displayName?: string | null;
  avatarUploadId?: string | null;
}

export class ProfileClientError extends Error {
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
    this.name = 'ProfileClientError';
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
export function toProfileClientError(
  status: number,
  body: Record<string, unknown>,
  lang: ProfileLang = 'en'
): ProfileClientError {
  const copy = getProfileCopy(lang);
  const code =
    typeof body['errorCode'] === 'string'
      ? body['errorCode']
      : 'PROFILE_FAILED';
  if (status === 401 && code === 'INVALID_SESSION') {
    return new ProfileClientError({
      status,
      errorCode: code,
      message: copy.expiredNotice,
      needsReauth: true,
    });
  }
  if (status === 401) {
    // Wrong current password and missing/deactivated membership collapse
    // here — one generic shape, no enumeration oracle.
    return new ProfileClientError({
      status,
      errorCode: code,
      message: copy.validationError,
      needsReauth: false,
    });
  }
  if (status === 403) {
    return new ProfileClientError({
      status,
      errorCode: 'PROFILE_FORBIDDEN',
      message: copy.forbiddenError,
    });
  }
  if (status === 400 && code === 'PASSWORD_POLICY') {
    const detail =
      typeof body['error'] === 'string' && body['error'].length > 0
        ? body['error']
        : copy.validationError;
    // Server policy detail is client-safe by contract; still cap length.
    return new ProfileClientError({
      status,
      errorCode: code,
      message: detail.slice(0, 200),
    });
  }
  if (status === 400) {
    return new ProfileClientError({
      status,
      errorCode: code,
      message: copy.validationError,
    });
  }
  return new ProfileClientError({
    status,
    errorCode: code,
    message: copy.genericError,
  });
}

async function getJson<T>(
  fetchFn: FetchFn,
  path: string,
  lang: ProfileLang
): Promise<T> {
  const res = await fetchFn(path, { credentials: 'same-origin' });
  if (!res.ok)
    throw toProfileClientError(res.status, await readBody(res), lang);
  return (await res.json()) as T;
}

async function sendJson<T>(
  fetchFn: FetchFn,
  path: string,
  method: string,
  payload: unknown,
  lang: ProfileLang
): Promise<T> {
  const res = await fetchFn(path, {
    method,
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload),
  });
  if (!res.ok)
    throw toProfileClientError(res.status, await readBody(res), lang);
  return (await res.json()) as T;
}

/** Read the caller's own profile (client-safe projection). */
export async function getProfile(
  opts: { fetchFn?: FetchFn; lang?: ProfileLang } = {}
): Promise<ProfileView> {
  const data = await getJson<{ profile: ProfileView }>(
    opts.fetchFn ?? fetch,
    '/api/auth/me',
    opts.lang ?? 'en'
  );
  return data.profile;
}

/**
 * Update display name and/or avatar reference. At least one field is
 * required; blank display names are rejected client-side. The avatar id must
 * reference a completed `file_uploads` row in the caller's workspace
 * (private Blob reference, never bytes or URLs).
 */
export async function updateProfile(
  input: UpdateProfileInput,
  opts: { fetchFn?: FetchFn; lang?: ProfileLang } = {}
): Promise<ProfileView> {
  const payload: Record<string, unknown> = {};
  if (input.displayName !== undefined)
    payload['displayName'] = input.displayName;
  if (input.avatarUploadId !== undefined)
    payload['avatarUploadId'] = input.avatarUploadId;
  const data = await sendJson<{ profile: ProfileView }>(
    opts.fetchFn ?? fetch,
    '/api/auth/me',
    'PATCH',
    payload,
    opts.lang ?? 'en'
  );
  return data.profile;
}

/**
 * Change password while authenticated. Revokes ALL sessions server-side and
 * clears the web cookie — the caller must redirect to re-auth. Password
 * values are sent once in the POST body and never stored or logged.
 */
export async function changePassword(
  input: { currentPassword: string; newPassword: string },
  opts: { fetchFn?: FetchFn; lang?: ProfileLang } = {}
): Promise<{ revokedCount: number }> {
  const data = await sendJson<{ revokedCount?: number }>(
    opts.fetchFn ?? fetch,
    '/api/auth/password/change',
    'POST',
    {
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    },
    opts.lang ?? 'en'
  );
  return { revokedCount: data.revokedCount ?? 0 };
}
