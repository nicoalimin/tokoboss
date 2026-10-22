/**
 * Marketplace Hapus koneksi / remove (US20 / RFC 04 task 88).
 * POST /api/workspaces/:workspaceId/integrations/:connectionId/remove
 * (Admin only, `write` access, from Terputus / disconnected only)
 *
 * No body. `removeConnection` releases the claim if still held, archives
 * this workspace's mappings for the store and soft-removes the row
 * (`removed_at`), so the store shows as Belum terhubung; row and history
 * stay. A connected row is 400 "Putuskan koneksi sebelum menghapusnya.".
 * Unknown, already removed, other-workspace or non-UUID ids are 404
 * CONNECTION_NOT_FOUND. The response never carries secrets.
 */
import {
  connectionNotFound,
  removeConnection,
  toConnectionView,
} from '@tokoboss/application';
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

export async function POST(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { workspaceId, connectionId } = await params;

  const admitted = await admitIntegrationMember(request, workspaceId, 'write');
  if (!admitted.ok) return integrationDenied(admitted.denial, ids);

  try {
    if (!UUID_RE.test(connectionId)) throw connectionNotFound();
    const saved = await removeConnection(getIntegrationDeps(), admitted.ctx, {
      workspaceId: admitted.ctx.workspaceId,
      connectionId,
    });
    const connection = toConnectionView(saved);
    return authJson({ connection }, 200, ...ids, admitted.cookie);
  } catch (err) {
    return integrationFailed(err, ids, 'Gagal menghapus koneksi toko');
  }
}
