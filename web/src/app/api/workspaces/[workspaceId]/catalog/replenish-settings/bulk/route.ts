import { bulkUpdateVariantReplenishSettings } from '@tokoboss/application';
import { BulkUpdateReplenishSettingsBodySchema } from '@tokoboss/contracts';
import {
  catalogErrorStatus,
  getCatalogStore,
  requireManagerOrAdmin,
  slideForMember,
  storageKind,
  toVariantView,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

/**
 * POST /api/workspaces/:workspaceId/catalog/replenish-settings/bulk
 * (Manager/Admin). Per-item compare-and-set on `expectedVersion`.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const { workspaceId } = await params;

  const manager = await requireManagerOrAdmin(request, workspaceId);
  if (!manager.ok) {
    return authJson(
      { error: manager.denial.error, errorCode: manager.denial.errorCode },
      manager.denial.status,
      requestId,
      correlationId
    );
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = BulkUpdateReplenishSettingsBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'CATALOG_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const updated = await bulkUpdateVariantReplenishSettings(
      getCatalogStore(),
      {
        ctx: manager.value.ctx,
        workspaceId: manager.value.ctx.workspaceId,
        items: parsed.data.items,
      }
    );
    return authJson(
      {
        variants: updated.map((v) => toVariantView(v)),
        storage: storageKind(),
      },
      200,
      requestId,
      correlationId,
      slideForMember(manager.value)
    );
  } catch (err) {
    const mapped = catalogErrorStatus(err);
    if (mapped.status === 500) {
      log.warn('catalog replenish-settings bulk update failed', {
        route: '/api/workspaces/[workspaceId]/catalog/replenish-settings/bulk',
        errorCode: mapped.errorCode,
      });
      return authJson(
        { error: 'Catalog update failed.', errorCode: mapped.errorCode },
        500,
        requestId,
        correlationId
      );
    }
    const details =
      typeof err === 'object' && err !== null && 'details' in err
        ? (err as { details?: Record<string, unknown> }).details
        : undefined;
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Catalog update failed.',
        errorCode: mapped.errorCode,
        ...(details !== undefined ? { details } : {}),
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
