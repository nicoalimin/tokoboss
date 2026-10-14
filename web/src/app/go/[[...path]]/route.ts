import {
  resolveWorkspaceLanding,
  validateSession,
} from '@tokoboss/application';
import {
  buildSessionCookie,
  extractTokenWithSource,
  getAuthDeps,
  getMemberStore,
} from '@/lib/auth';

/**
 * US29 / RFC 02 row 59 — `/go/[[...path]]` resolver for legacy links
 * WITHOUT a workspace id (middleware row 60 sends `/stok-tipis` etc. here).
 *
 * - no / expired session → `/sign-in?next=/go/<path>`;
 * - landing workspace (valid last-used, or exactly one accessible) →
 *   `/w/<id>/<path>`;
 * - otherwise → `/pilih-workspace?next=/<path>` (picker keeps the target).
 *
 * Accepts account (NULL-workspace) and workspace-bound sessions. Empty path
 * means `/dashboard`; the query string is kept. Membership is still enforced
 * by the `/w/[workspaceId]` layout (row 37). Redirects are 307: the target
 * depends on session state, so they must not be cached.
 */

type Params = { params: Promise<{ path?: string[] }> };

/** `/<seg>/<seg>` re-encoded; dot segments dropped; empty → `/dashboard`. */
function legacyPath(segments: string[] | undefined): string {
  const parts = (segments ?? []).filter(
    (s) => s !== '' && s !== '.' && s !== '..'
  );
  if (parts.length === 0) return '/dashboard';
  return `/${parts.map((s) => encodeURIComponent(s)).join('/')}`;
}

function redirectTo(request: Request, target: string, cookie?: string) {
  const headers = new Headers({
    location: new URL(target, request.url).toString(),
    'cache-control': 'no-store',
  });
  if (cookie) headers.append('set-cookie', cookie);
  return new Response(null, { status: 307, headers });
}

export async function GET(request: Request, { params }: Params) {
  const { path } = await params;
  const target = `${legacyPath(path)}${new URL(request.url).search}`;

  const source = extractTokenWithSource(request);
  const session = source
    ? await validateSession(getAuthDeps(), source.token)
    : null;
  if (!source || !session) {
    return redirectTo(
      request,
      `/sign-in?next=${encodeURIComponent(`/go${target}`)}`
    );
  }

  const cookie =
    source.viaCookie && session.session.platform === 'web'
      ? buildSessionCookie(source.token)
      : undefined;
  const landing = await resolveWorkspaceLanding(
    getMemberStore(),
    session.userId
  );
  if (landing.kind === 'workspace') {
    const base = `/w/${encodeURIComponent(landing.workspaceId)}`;
    return redirectTo(request, `${base}${target}`, cookie);
  }
  return redirectTo(
    request,
    `/pilih-workspace?next=${encodeURIComponent(target)}`,
    cookie
  );
}
