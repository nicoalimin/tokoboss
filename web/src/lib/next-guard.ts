import type { AuthLanding } from '@tokoboss/contracts';

/**
 * US29 / RFC 02 rows 64 + 39 — pure `next` guards shared by the sign-in
 * form and the workspace picker (extracted so row 67 can unit-test them).
 */

/** Row 64: follow a safe `next`, else the sign-in landing. */
export function postSignInHref(
  next: string | null,
  landing: AuthLanding | null
): string {
  const safe =
    next !== null &&
    !next.startsWith('//') &&
    ['/w/', '/akun/', '/accept-invite', '/go/'].some((p) => next.startsWith(p));
  if (safe) return next;
  if (landing?.kind === 'workspace') {
    return `/w/${encodeURIComponent(landing.workspaceId)}/dashboard`;
  }
  return '/pilih-workspace';
}

/** Row 39: enter a workspace, remapping a safe in-app `next` under `/w/:id`. */
export function enterHref(workspaceId: string, next: string | null): string {
  const base = `/w/${encodeURIComponent(workspaceId)}`;
  const bad =
    !next ||
    !next.startsWith('/') ||
    next.startsWith('//') ||
    next.startsWith('/akun/') ||
    next.startsWith('/accept-invite') ||
    next.startsWith('/sign-in') ||
    next.startsWith('/pilih-workspace') ||
    next.startsWith('/go/');
  if (bad) return `${base}/dashboard`;
  const m = /^\/w\/[^/]+(\/.*)?$/.exec(next);
  if (m) return `${base}${m[1] && m[1].length > 1 ? m[1] : '/dashboard'}`;
  return `${base}${next}`;
}
