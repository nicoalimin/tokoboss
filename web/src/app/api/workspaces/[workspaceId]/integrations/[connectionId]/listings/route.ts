/**
 * Marketplace staged listings review (US20 / RFC 04 task 89c).
 * GET /api/workspaces/:workspaceId/integrations/:connectionId/listings
 * (Admin or Manager, `listing` access; Staff 403 ROLE_FORBIDDEN)
 *
 * Query: optional `mapping_state` (unmapped | suggested | ambiguous |
 * mapped | ignored; unknown → 400 INTEGRATION_VALIDATION) and `cursor`
 * (the previous page's `nextCursor`). `listStagedListings` re-checks the
 * role; unknown, removed, other-workspace or non-UUID ids are 404
 * CONNECTION_NOT_FOUND. Shape: `IntegrationListingsPage` (dates serialize
 * as ISO strings). Read-only: rows carry hints, nothing writes mappings.
 */
import { connectionNotFound, listStagedListings } from '@tokoboss/application';
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
    const query = new URL(request.url).searchParams;
    const page = await listStagedListings(getIntegrationDeps(), admitted.ctx, {
      workspaceId: admitted.ctx.workspaceId,
      connectionId,
      mappingState: query.get('mapping_state'),
      cursor: query.get('cursor'),
    });
    return authJson(page, 200, ...ids, admitted.cookie);
  } catch (err) {
    return integrationFailed(err, ids, 'Gagal memuat daftar listing toko');
  }
}
