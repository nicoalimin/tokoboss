/**
 * US29 / RFC 02 row 60 — pure legacy → new-path target resolver for middleware.
 *
 * - `/profil` `/profile` → `/akun/profil`; `/sessions` → `/akun/sesi`
 * - ID-bearing (`?workspaceId=` / `?workspace=`): `/w/<id>/<path>` (sign-in → dashboard);
 *   workspace query keys dropped
 * - ID-less legacy UI paths: `/go/<path>` (`/` → `/go/dashboard`)
 *
 * Returns a same-origin path+search string, or null when middleware should
 * only propagate correlation headers. Membership / 404 stay in `/w/` layout.
 */

const ACCOUNT_REDIRECTS: Readonly<Record<string, string>> = {
  '/profil': '/akun/profil',
  '/profile': '/akun/profil',
  '/sessions': '/akun/sesi',
};

/** Top-level legacy UI sections still served by pre-`/w/` pages until rows 61–63. */
const LEGACY_UI_ROOTS = [
  '/produk',
  '/gudang',
  '/ledger',
  '/transfer',
  '/stok-tipis',
  '/team',
  '/pengaturan',
] as const;

function isLegacyUiPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return LEGACY_UI_ROOTS.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`)
  );
}

function workspaceFromSearch(searchParams: URLSearchParams): string | null {
  const raw =
    searchParams.get('workspaceId')?.trim() ||
    searchParams.get('workspace')?.trim() ||
    '';
  return raw.length > 0 ? raw : null;
}

function dropWorkspaceParams(searchParams: URLSearchParams): string {
  const next = new URLSearchParams(searchParams);
  next.delete('workspaceId');
  next.delete('workspace');
  const qs = next.toString();
  return qs ? `?${qs}` : '';
}

/**
 * @param pathname URL pathname (no query), e.g. `/stok-tipis`
 * @param searchParams request query (mutated copy is fine; not mutated here)
 */
export function legacyRedirectTarget(
  pathname: string,
  searchParams: URLSearchParams
): string | null {
  const account = ACCOUNT_REDIRECTS[pathname];
  if (account) {
    return `${account}${dropWorkspaceParams(searchParams)}`;
  }

  const workspaceId = workspaceFromSearch(searchParams);
  if (workspaceId) {
    const id = encodeURIComponent(workspaceId);
    const rest = dropWorkspaceParams(searchParams);
    if (pathname === '/sign-in' || pathname === '/') {
      return `/w/${id}/dashboard${rest}`;
    }
    if (isLegacyUiPath(pathname)) {
      return `/w/${id}${pathname}${rest}`;
    }
    // Other pages with a workspace query: still open that workspace's dashboard
    // only when the path is the legacy sign-in/home case above; otherwise leave.
    return null;
  }

  if (isLegacyUiPath(pathname)) {
    const path = pathname === '/' ? '/dashboard' : pathname;
    const qs = searchParams.toString();
    return `/go${path}${qs ? `?${qs}` : ''}`;
  }

  return null;
}
