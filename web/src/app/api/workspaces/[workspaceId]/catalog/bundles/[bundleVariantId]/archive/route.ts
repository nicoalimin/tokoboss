import { archiveBundle } from '@tokoboss/application';
import { ArchiveBundleBodySchema } from '@tokoboss/contracts';
import {
  catalogErrorStatus,
  getCatalogStore,
  requireManagerOrAdmin,
  slideForMember,
  storageKind,
  toBundleView,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string; bundleVariantId: string }>;
}

/**
 * Archive a bundle BOM — clears every line (UTA-79, Story 13).
 * POST /api/workspaces/:workspaceId/catalog/bundles/:bundleVariantId/archive
 * (Manager/Admin).
 *
 * Idempotent: clearing an already-empty BOM returns the current detail
 * without bumping the version. The bundle variant itself keeps its
 * status — retire the SKU through the catalog archive endpoints.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const { workspaceId, bundleVariantId } = await params;

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
  const parsed = ArchiveBundleBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'BUNDLE_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const archived = await archiveBundle(getCatalogStore(), {
      ctx: manager.value.ctx,
      workspaceId: manager.value.ctx.workspaceId,
      bundleVariantId,
      expectedVersion: parsed.data.expectedVersion,
    });
    log.info('bundle BOM archived', {
      route:
        '/api/workspaces/[workspaceId]/catalog/bundles/[bundleVariantId]/archive',
      bundleVariantId: archived.bundle.id,
    });
    return authJson(
      { bundle: toBundleView(archived), storage: storageKind() },
      200,
      requestId,
      correlationId,
      slideForMember(manager.value)
    );
  } catch (err) {
    const mapped = catalogErrorStatus(err);
    if (mapped.status === 500) {
      log.warn('bundle BOM archive failed', {
        route:
          '/api/workspaces/[workspaceId]/catalog/bundles/[bundleVariantId]/archive',
        errorCode: mapped.errorCode,
      });
      return authJson(
        { error: 'Bundle archive failed.', errorCode: mapped.errorCode },
        500,
        requestId,
        correlationId
      );
    }
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Bundle archive failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
