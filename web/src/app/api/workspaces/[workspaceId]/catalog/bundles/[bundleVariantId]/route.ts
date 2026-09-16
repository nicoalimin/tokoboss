import { getBundleDetail, updateBundle } from '@tokoboss/application';
import { UpdateBundleBodySchema } from '@tokoboss/contracts';
import {
  catalogErrorStatus,
  getCatalogStore,
  requireManagerOrAdmin,
  requireWorkspaceMember,
  slideForMember,
  storageKind,
  toBundleView,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string; bundleVariantId: string }>;
}

/**
 * Bundle detail with components + per-warehouse availability (UTA-79).
 * GET /api/workspaces/:workspaceId/catalog/bundles/:bundleVariantId
 * (any active member; workspace-scoped).
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const { workspaceId, bundleVariantId } = await params;

  const member = await requireWorkspaceMember(request, workspaceId);
  if (!member.ok) {
    return authJson(
      { error: member.denial.error, errorCode: member.denial.errorCode },
      member.denial.status,
      requestId,
      correlationId
    );
  }

  try {
    const detail = await getBundleDetail(getCatalogStore(), {
      ctx: member.value.ctx,
      workspaceId: member.value.ctx.workspaceId,
      bundleVariantId,
    });
    return authJson(
      { bundle: toBundleView(detail), storage: storageKind() },
      200,
      requestId,
      correlationId,
      slideForMember(member.value)
    );
  } catch (err) {
    const mapped = catalogErrorStatus(err);
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Bundle read failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}

/**
 * Replace the full BOM of a bundle variant (UTA-79, Story 13).
 * PATCH /api/workspaces/:workspaceId/catalog/bundles/:bundleVariantId
 * (Manager/Admin). Stale `expectedVersion` values reject with 409 (no
 * silent overwrite); cycles reject with 422 `BUNDLE_CYCLE`.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
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
  const parsed = UpdateBundleBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'BUNDLE_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const updated = await updateBundle(getCatalogStore(), {
      ctx: manager.value.ctx,
      workspaceId: manager.value.ctx.workspaceId,
      bundleVariantId,
      components: parsed.data.components,
      expectedVersion: parsed.data.expectedVersion,
    });
    return authJson(
      { bundle: toBundleView(updated), storage: storageKind() },
      200,
      requestId,
      correlationId,
      slideForMember(manager.value)
    );
  } catch (err) {
    const mapped = catalogErrorStatus(err);
    if (mapped.status === 500) {
      log.warn('bundle BOM update failed', {
        route:
          '/api/workspaces/[workspaceId]/catalog/bundles/[bundleVariantId]',
        errorCode: mapped.errorCode,
      });
      return authJson(
        { error: 'Bundle update failed.', errorCode: mapped.errorCode },
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
        error: err instanceof Error ? err.message : 'Bundle update failed.',
        errorCode: mapped.errorCode,
        ...(details !== undefined ? { details } : {}),
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}

/**
 * BOM lines are never hard-deleted — archive instead (UTA-79).
 * DELETE always answers 405 `CATALOG_NO_HARD_DELETE`.
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const { workspaceId } = await params;

  const member = await requireWorkspaceMember(request, workspaceId);
  if (!member.ok) {
    return authJson(
      { error: member.denial.error, errorCode: member.denial.errorCode },
      member.denial.status,
      requestId,
      correlationId
    );
  }
  return authJson(
    {
      error: 'Bundle BOM lines are never hard-deleted. Archive instead.',
      errorCode: 'CATALOG_NO_HARD_DELETE',
    },
    405,
    requestId,
    correlationId,
    slideForMember(member.value)
  );
}
