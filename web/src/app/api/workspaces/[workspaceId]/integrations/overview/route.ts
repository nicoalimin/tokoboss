/**
 * Integration Center overview route (UTA-38 / US18, RFC 07 addendum row
 * 44g): GET /api/workspaces/:workspaceId/integrations/overview.
 * Every active member (status read). Membership gate first (401 / neutral
 * 404 via `admitIntegrationMember`), then `loadIntegrationCenterOverview`
 * (44f). Shape: `IntegrationCenterOverviewResponse` (dates as ISO strings).
 * Route tests land in 44h.
 */
import { authJson, routeContext } from '@/lib/auth-routes';
import {
  admitIntegrationMember,
  integrationDenied,
  integrationFailed,
  type RouteIds,
} from '@/lib/integration-access';
import { loadIntegrationCenterOverview } from '@/lib/integration-overview-server';

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
    const overview = await loadIntegrationCenterOverview(
      admitted.ctx,
      admitted.ctx.workspaceId
    );
    return authJson(overview, 200, ...ids, admitted.cookie);
  } catch (err) {
    return integrationFailed(err, ids, 'Gagal memuat ringkasan integrasi');
  }
}
