/**
 * Marketplace connection detail (US20 / RFC 04 task 86a).
 * GET /api/workspaces/:workspaceId/integrations/:connectionId (every member)
 *
 * Membership gate first (401 / neutral 404 via `admitIntegrationMember`),
 * then `getConnection` re-checks the status-read role. Removed (Hapus
 * koneksi), unknown, other-workspace or non-UUID ids are 404
 * CONNECTION_NOT_FOUND. The view never carries secrets. Shape:
 * `IntegrationConnectionDetailResponse` (dates serialize as ISO strings).
 * DELETE (Putuskan, Admin) is task 86b.
 */
import { connectionNotFound, getConnection } from '@tokoboss/application';
import { authJson, routeContext } from '@/lib/auth-routes';
import {
  admitIntegrationMember,
  integrationDenied,
  integrationFailed,
  type RouteIds,
} from '@/lib/integration-access';
import { getIntegrationDeps } from '@/lib/integrations';

interface RouteParams {
  params: Promise<{ workspaceId: string; connectionId: string }>;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { workspaceId, connectionId } = await params;

  const admitted = await admitIntegrationMember(request, workspaceId, 'status');
  if (!admitted.ok) return integrationDenied(admitted.denial, ids);

  try {
    if (!UUID_RE.test(connectionId)) throw connectionNotFound();
    const connection = await getConnection(getIntegrationDeps(), admitted.ctx, {
      workspaceId: admitted.ctx.workspaceId,
      connectionId,
    });
    return authJson({ connection }, 200, ...ids, admitted.cookie);
  } catch (err) {
    return integrationFailed(err, ids, 'Gagal memuat koneksi toko');
  }
}
