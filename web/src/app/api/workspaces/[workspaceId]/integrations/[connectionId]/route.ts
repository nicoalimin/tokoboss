/**
 * Marketplace connection detail (US20 / RFC 04 tasks 86a, 86b).
 * GET /api/workspaces/:workspaceId/integrations/:connectionId (every member)
 * DELETE same path = Putuskan (Admin only, `write` access)
 *
 * Membership gate first (401 / neutral 404 via `admitIntegrationMember`),
 * then `getConnection` re-checks the status-read role. Removed (Hapus
 * koneksi), unknown, other-workspace or non-UUID ids are 404
 * CONNECTION_NOT_FOUND. The view never carries secrets. Shape:
 * `IntegrationConnectionDetailResponse` (dates serialize as ISO strings)
 * plus Story 18 `health`, `metrics` and `checklist` (RFC 07 row 27).
 * DELETE: `disconnectConnection` (shred, release claim, keep mappings).
 * Optional body `{ confirmationText: 'PUTUSKAN' }`; any other confirmation
 * is 422 INTEGRATION_VALIDATION. No body keeps the old behaviour.
 */
import {
  connectionNotFound,
  disconnectConnection,
  getConnection,
  toConnectionView,
} from '@tokoboss/application';
import { DisconnectConnectionBodySchema } from '@tokoboss/contracts';
import { authJson, routeContext } from '@/lib/auth-routes';
import {
  admitIntegrationMember,
  integrationDenied,
  integrationFailed,
  type RouteIds,
} from '@/lib/integration-access';
import { getIntegrationDeps } from '@/lib/integrations';
import { getIntegrationMetricsReads } from '@/lib/integration-management-reads';
import { toStoreHealthRowView } from '@/lib/integration-management-views';

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
    const metrics = await getIntegrationMetricsReads().getByConnection(
      admitted.ctx.workspaceId,
      connectionId
    );
    const view = toStoreHealthRowView(connection, metrics, new Date());
    return authJson(view, 200, ...ids, admitted.cookie);
  } catch (err) {
    return integrationFailed(err, ids, 'Gagal memuat koneksi toko');
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { workspaceId, connectionId } = await params;

  const admitted = await admitIntegrationMember(request, workspaceId, 'write');
  if (!admitted.ok) return integrationDenied(admitted.denial, ids);

  try {
    if (!UUID_RE.test(connectionId)) throw connectionNotFound();
    const body: unknown = await request.json().catch(() => ({}));
    if (!DisconnectConnectionBodySchema.safeParse(body).success) {
      const error = 'Ketik PUTUSKAN untuk memutuskan toko.';
      const errorCode = 'INTEGRATION_VALIDATION';
      return authJson({ error, errorCode }, 422, ...ids);
    }
    const saved = await disconnectConnection(
      getIntegrationDeps(),
      admitted.ctx,
      { workspaceId: admitted.ctx.workspaceId, connectionId }
    );
    const connection = toConnectionView(saved);
    return authJson({ connection }, 200, ...ids, admitted.cookie);
  } catch (err) {
    return integrationFailed(err, ids, 'Gagal memutuskan koneksi toko');
  }
}
