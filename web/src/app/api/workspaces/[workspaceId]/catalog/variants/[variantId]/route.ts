import {
  catalogNoHardDelete,
  getVariant,
  updateVariant,
} from '@tokoboss/application';
import { UpdateVariantBodySchema } from '@tokoboss/contracts';
import {
  catalogErrorStatus,
  getCatalogStore,
  requireManagerOrAdmin,
  requireWorkspaceMember,
  slideForMember,
  storageKind,
  toMappingView,
  toVariantView,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string; variantId: string }>;
}

/**
 * Variant detail with levels + mappings (UTA-75, Story 01).
 * GET /api/workspaces/:workspaceId/catalog/variants/:variantId
 * (any active member; workspace-scoped).
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const { workspaceId, variantId } = await params;

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
    const detail = await getVariant(getCatalogStore(), {
      ctx: member.value.ctx,
      workspaceId: member.value.ctx.workspaceId,
      variantId,
    });
    return authJson(
      {
        variant: {
          ...toVariantView(detail.variant, detail.levels),
          mappings: detail.mappings.map(toMappingView),
        },
        storage: storageKind(),
      },
      200,
      requestId,
      correlationId,
      slideForMember(member.value)
    );
  } catch (err) {
    const mapped = catalogErrorStatus(err);
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Catalog read failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}

/**
 * Update permitted variant fields (UTA-75, Story 01).
 * PATCH /api/workspaces/:workspaceId/catalog/variants/:variantId
 * (Manager/Admin).
 *
 * `skuCode` is additionally Admin-only AND locked once the variant has
 * stock movements or marketplace mappings (422 `CATALOG_SKU_LOCKED`).
 * Stale `expectedVersion` values reject with 409.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
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
  const parsed = UpdateVariantBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'CATALOG_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const updated = await updateVariant(getCatalogStore(), {
      ctx: manager.value.ctx,
      workspaceId: manager.value.ctx.workspaceId,
      variantId,
      skuCode: parsed.data.skuCode,
      name: parsed.data.name,
      barcode: parsed.data.barcode,
      sellingPriceCents: parsed.data.sellingPriceCents,
      hppCents: parsed.data.hppCents,
      costSource: parsed.data.costSource,
      listingName: parsed.data.listingName,
      expectedVersion: parsed.data.expectedVersion,
    });
    const detail = await getVariant(getCatalogStore(), {
      ctx: manager.value.ctx,
      workspaceId: manager.value.ctx.workspaceId,
      variantId: updated.id,
    });
    return authJson(
      {
        variant: {
          ...toVariantView(detail.variant, detail.levels),
          mappings: detail.mappings.map(toMappingView),
        },
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
      log.warn('catalog variant update failed', {
        route: '/api/workspaces/[workspaceId]/catalog/variants/[variantId]',
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

/**
 * Catalog rows are never hard-deleted — archive instead (UTA-75).
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
  const err = catalogNoHardDelete();
  const mapped = catalogErrorStatus(err);
  return authJson(
    {
      error: err.message,
      errorCode: mapped.errorCode,
    },
    mapped.status,
    requestId,
    correlationId,
    slideForMember(member.value)
  );
}
