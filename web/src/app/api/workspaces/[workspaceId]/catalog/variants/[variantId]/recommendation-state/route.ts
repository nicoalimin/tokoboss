import {
  setRecommendationState,
  type CatalogRecommendationStateRecord,
} from '@tokoboss/application';
import {
  SetRecommendationStateBodySchema,
  type RecommendationStateView,
} from '@tokoboss/contracts';
import {
  catalogErrorStatus,
  getCatalogStore,
  requireManagerOrAdmin,
  slideForMember,
  storageKind,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string; variantId: string }>;
}

function toRecommendationStateView(
  record: CatalogRecommendationStateRecord
): RecommendationStateView {
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    variantId: record.variantId,
    status: record.status,
    snoozedUntil: record.snoozedUntil
      ? record.snoozedUntil.toISOString()
      : null,
    suggestedReorderQtyOverride: record.suggestedReorderQtyOverride,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * PUT /api/workspaces/:workspaceId/catalog/variants/:variantId/recommendation-state
 * (Manager/Admin). Dismiss / snooze / edit suggested qty on a low-stock
 * recommendation. `expectedVersion` null = first write; number = CAS.
 */
export async function PUT(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const { workspaceId, variantId } = await params;

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
  const parsed = SetRecommendationStateBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'CATALOG_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const snoozedUntil =
      parsed.data.snoozedUntil == null
        ? null
        : new Date(parsed.data.snoozedUntil);
    const state = await setRecommendationState(getCatalogStore(), {
      ctx: manager.value.ctx,
      workspaceId: manager.value.ctx.workspaceId,
      variantId,
      status: parsed.data.status,
      snoozedUntil,
      suggestedReorderQtyOverride:
        parsed.data.suggestedReorderQtyOverride ?? null,
      expectedVersion: parsed.data.expectedVersion,
    });
    return authJson(
      {
        recommendationState: toRecommendationStateView(state),
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
      log.warn('catalog recommendation-state update failed', {
        route:
          '/api/workspaces/[workspaceId]/catalog/variants/[variantId]/recommendation-state',
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
