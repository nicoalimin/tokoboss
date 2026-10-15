import type { AuthLanding } from '@tokoboss/contracts';

/**
 * US29 / RFC 02 rows 64 + 39 — pure `next` guards shared by the sign-in
 * form and the workspace picker (extracted so row 67 can unit-test them).
 * Slice c1: postSignInHref only; enterHref lands in the next slice.
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
