/**
 * Pilih gudang sumber list (US20 / RFC 04 task 121h, CoS split of row 121).
 * GET /api/workspaces/:workspaceId/integrations/:connectionId/locations
 * (Admin or Manager, `listing` access; Staff 403 ROLE_FORBIDDEN)
 *
 * No query params. `listLocationLinks` re-checks the role; unknown,
 * removed, other-workspace or non-UUID ids are 404 CONNECTION_NOT_FOUND.
 * Shape: `IntegrationLocationLinkListResponse` `{ locations }`, sorted by
 * name (unnamed last), then provider location id; `warehouseId` null means
 * not linked yet. Read-only: linking is PUT .../locations/:locationLinkId.
 */
import { connectionNotFound, listLocationLinks } from '@tokoboss/application';
import type { IntegrationLocationLinkListResponse } from '@tokoboss/contracts';
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

  const admitted = await admitIntegrationMember(
    request,
    workspaceId,
    'listing'
  );
  if (!admitted.ok) return integrationDenied(admitted.denial, ids);

  try {
    if (!UUID_RE.test(connectionId)) throw connectionNotFound();
    const body: IntegrationLocationLinkListResponse = await listLocationLinks(
      getIntegrationDeps(),
      admitted.ctx,
      { workspaceId: admitted.ctx.workspaceId, connectionId }
    );
    return authJson(body, 200, ...ids, admitted.cookie);
  } catch (err) {
    return integrationFailed(err, ids, 'Gagal memuat gudang sumber');
  }
}
