import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { CORRELATION_ID_HEADER } from '@tokoboss/observability';
import { requireWorkspaceMember } from '@/lib/workspace-access';

/**
 * US29 / RFC 02 row 37 — `/w/[workspaceId]` server layout.
 *
 * The membership authority for every workspace page (middleware is not):
 * - no / expired session → `/sign-in?next=/w/<id>/<path>`;
 * - any no-access case (malformed/unknown id, never a member, deactivated
 *   membership, deactivated workspace) → `notFound()`: one neutral HTTP 404,
 *   rendered by `app/w/not-found.tsx` (`WorkspaceNotAvailable`, row 36);
 * - access → children. `accessWorkspace` (via row 30's
 *   `requireWorkspaceMember`) already writes `last_active_at` (60 s throttle).
 *
 * Role 403s stay on each page (`NoAccess`). Server Components cannot set
 * cookies, so the web cookie keeps sliding through the API routes.
 */

/** Request pathname forwarded by middleware (row 60); optional until then. */
const PATHNAME_HEADER = 'x-tokoboss-pathname';

function signInTarget(workspaceId: string, pathname: string | null): string {
  const base = `/w/${encodeURIComponent(workspaceId)}`;
  const safe =
    pathname !== null &&
    (pathname === base || pathname.startsWith(`${base}/`)) &&
    !pathname.includes('//');
  const next = safe ? pathname : `${base}/dashboard`;
  return `/sign-in?next=${encodeURIComponent(next)}`;
}

export default async function WorkspaceLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}>) {
  const { workspaceId } = await params;
  const incoming = await headers();
  const result = await requireWorkspaceMember(
    new Request('http://tokoboss.internal/', { headers: incoming }),
    workspaceId,
    { correlationId: incoming.get(CORRELATION_ID_HEADER) ?? undefined }
  );
  if (!result.ok) {
    if (result.denial.status === 401) {
      redirect(signInTarget(workspaceId, incoming.get(PATHNAME_HEADER)));
    }
    notFound();
  }
  return <>{children}</>;
}
