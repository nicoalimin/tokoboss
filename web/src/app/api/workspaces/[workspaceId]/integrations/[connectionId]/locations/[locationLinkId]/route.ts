/**
 * Pilih gudang sumber: location → warehouse link (US20 / RFC 04 task 91).
 * PUT /api/workspaces/:workspaceId/integrations/:connectionId/locations/:locationLinkId
 * (Admin only, `write` access; Manager / Staff 403 ROLE_FORBIDDEN)
 *
 * `locationLinkId` is the provider location id (`externalLocationId`:
 * Shopee location, TikTok warehouse, Blibli pickup point). Body
 * `IntegrationLocationLinkBody` `{ warehouseId }`; null clears the link.
 * Unknown, removed, other-workspace or non-UUID connection ids and unknown
 * locations are 404 CONNECTION_NOT_FOUND; a missing, inactive or non-UUID
 * warehouse is 400. Shape: `IntegrationLocationLinkResponse`.
 */
import {
  assignLocationLink,
  connectionNotFound,
  integrationValidation,
} from '@tokoboss/application';
import { IntegrationLocationLinkBodySchema } from '@tokoboss/contracts';
import { authJson, routeContext } from '@/lib/auth-routes';
import { getCatalogStore } from '@/lib/catalog';
import {
  admitIntegrationMember,
  integrationDenied,
  integrationFailed,
  type RouteIds,
} from '@/lib/integration-access';
import { getIntegrationDeps } from '@/lib/integrations';

interface RouteParams {
  params: Promise<{
    workspaceId: string;
    connectionId: string;
    locationLinkId: string;
  }>;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { workspaceId, connectionId, locationLinkId } = await params;

  const admitted = await admitIntegrationMember(request, workspaceId, 'write');
  if (!admitted.ok) return integrationDenied(admitted.denial, ids);

  try {
    if (!UUID_RE.test(connectionId)) throw connectionNotFound();
    const body: unknown = await request.json().catch(() => null);
    const parsed = IntegrationLocationLinkBodySchema.safeParse(body);
    if (!parsed.success) throw integrationValidation('Permintaan tidak valid.');
    const { warehouseId } = parsed.data;
    if (warehouseId !== null && !UUID_RE.test(warehouseId)) {
      throw integrationValidation('Gudang tidak ditemukan.');
    }
    const deps = { ...getIntegrationDeps(), catalog: getCatalogStore() };
    const link = await assignLocationLink(deps, admitted.ctx, {
      workspaceId: admitted.ctx.workspaceId,
      connectionId,
      externalLocationId: locationLinkId,
      warehouseId,
    });
    return authJson(link, 200, ...ids, admitted.cookie);
  } catch (err) {
    return integrationFailed(err, ids, 'Gagal menyimpan gudang sumber');
  }
}
