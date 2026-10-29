/**
 * Store capability controls (UTA-38 / US18, RFC 07 row 25).
 * PATCH /api/workspaces/:workspaceId/integrations/:connectionId/controls
 * (Admin only, `write` access; Manager / Staff 403 ROLE_FORBIDDEN)
 *
 * Body `UpdateConnectionControlsBody` `{ orderImportEnabled?,
 * inventorySyncEnabled?, reconcileNow? }` (at least one; strict) else 400
 * INTEGRATION_VALIDATION. Jeda / Lanjutkan Impor Order and Sinkronisasi
 * Stok independently; resuming stock sync (or `reconcileNow` with sync on)
 * queues and runs the catch-up `marketplace.inventory_sync` job in-request
 * (no crons). Only connected stores (else 400); unknown, removed,
 * other-workspace or non-UUID ids are 404 CONNECTION_NOT_FOUND. Shape:
 * `{ connection, reconciliationQueued }`; never secrets.
 */
import {
  connectionNotFound,
  integrationValidation,
  toConnectionView,
} from '@tokoboss/application';
import { UpdateConnectionControlsBodySchema } from '@tokoboss/contracts';
import { authJson, routeContext } from '@/lib/auth-routes';
import {
  admitIntegrationMember,
  integrationDenied,
  integrationFailed,
  type RouteIds,
} from '@/lib/integration-access';
import { updateIntegrationConnectionControls } from '@/lib/integration-management-server';

interface RouteParams {
  params: Promise<{ workspaceId: string; connectionId: string }>;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { workspaceId, connectionId } = await params;

  const admitted = await admitIntegrationMember(request, workspaceId, 'write');
  if (!admitted.ok) return integrationDenied(admitted.denial, ids);

  try {
    if (!UUID_RE.test(connectionId)) throw connectionNotFound();
    const body: unknown = await request.json().catch(() => null);
    const parsed = UpdateConnectionControlsBodySchema.safeParse(body);
    if (!parsed.success) throw integrationValidation('Permintaan tidak valid.');
    const result = await updateIntegrationConnectionControls(
      admitted.ctx,
      { ...parsed.data, workspaceId: admitted.ctx.workspaceId, connectionId },
      log
    );
    const connection = toConnectionView(result.connection);
    const { reconciliationQueued } = result;
    return authJson(
      { connection, reconciliationQueued },
      200,
      ...ids,
      admitted.cookie
    );
  } catch (err) {
    return integrationFailed(err, ids, 'Gagal menyimpan kontrol toko');
  }
}
