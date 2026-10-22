/**
 * Marketplace connections list (US20 / RFC 04 task 85a).
 * GET /api/workspaces/:workspaceId/integrations (every active member)
 *
 * Membership gate first (401 / neutral 404 via `admitIntegrationMember`),
 * then `listConnections` re-checks the status-read role. Removed rows
 * (Hapus koneksi) are hidden and views never carry secrets. Shape:
 * `IntegrationConnectionListResponse` (dates serialize as ISO strings).
 * POST {provider} (Admin, task 85b): authorize URL or Blibli key form.
 */
import {
  integrationValidation,
  listConnections,
  startConnection,
} from '@tokoboss/application';
import { IntegrationStartConnectionBodySchema } from '@tokoboss/contracts';
import { authJson, routeContext } from '@/lib/auth-routes';
import {
  admitIntegrationMember,
  integrationDenied,
  integrationFailed,
  type RouteIds,
} from '@/lib/integration-access';
import { getIntegrationDeps } from '@/lib/integrations';

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { workspaceId } = await params;

  const admitted = await admitIntegrationMember(request, workspaceId, 'status');
  if (!admitted.ok) return integrationDenied(admitted.denial, ids);

  try {
    const connections = await listConnections(
      getIntegrationDeps(),
      admitted.ctx,
      { workspaceId: admitted.ctx.workspaceId }
    );
    return authJson({ connections }, 200, ...ids, admitted.cookie);
  } catch (err) {
    return integrationFailed(err, ids, 'Gagal memuat koneksi toko');
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { workspaceId } = await params;

  const admitted = await admitIntegrationMember(request, workspaceId, 'write');
  if (!admitted.ok) return integrationDenied(admitted.denial, ids);

  try {
    const body: unknown = await request.json().catch(() => ({}));
    const parsed = IntegrationStartConnectionBodySchema.safeParse(body);
    if (!parsed.success) throw integrationValidation('Permintaan tidak valid.');
    const started = await startConnection(getIntegrationDeps(), admitted.ctx, {
      workspaceId: admitted.ctx.workspaceId,
      provider: parsed.data.provider,
    });
    return authJson(started, 200, ...ids, admitted.cookie);
  } catch (err) {
    return integrationFailed(err, ids, 'Gagal memulai koneksi toko');
  }
}
