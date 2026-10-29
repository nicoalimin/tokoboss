/**
 * Store activity feed (UTA-38 / US18, RFC 07 row 26).
 * GET /api/workspaces/:workspaceId/integrations/:connectionId/activity
 * (every member, `status` access: Admin, Manager, Staff)
 *
 * Query `?limit=20` (`IntegrationActivityQuerySchema`: integer 1..50,
 * default 20) else 400 INTEGRATION_VALIDATION. Log Aktivitas & Audit
 * Integrasi for one store, newest first, with the Bahasa Indonesia
 * operational impact and WIB label. Unknown, removed, other-workspace or
 * non-UUID ids are 404 CONNECTION_NOT_FOUND. Shape: `{ items:
 * IntegrationActivityItemDto[] }`; never secrets or buyer PII.
 */
import {
  connectionNotFound,
  integrationValidation,
} from '@tokoboss/application';
import { IntegrationActivityQuerySchema } from '@tokoboss/contracts';
import { authJson, routeContext } from '@/lib/auth-routes';
import {
  admitIntegrationMember,
  integrationDenied,
  integrationFailed,
  type RouteIds,
} from '@/lib/integration-access';
import { listIntegrationActivityItems } from '@/lib/integration-management-server';

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
    const limit = new URL(request.url).searchParams.get('limit');
    const query = IntegrationActivityQuerySchema.safeParse({
      limit: limit ?? undefined,
    });
    if (!query.success) throw integrationValidation('Permintaan tidak valid.');
    const body = await listIntegrationActivityItems(admitted.ctx, {
      workspaceId: admitted.ctx.workspaceId,
      connectionId,
      limit: query.data.limit,
    });
    return authJson(body, 200, ...ids, admitted.cookie);
  } catch (err) {
    return integrationFailed(err, ids, 'Gagal memuat log aktivitas toko');
  }
}
