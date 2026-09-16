import { createMapping, listMappings } from '@tokoboss/application';
import { CreateMappingBodySchema } from '@tokoboss/contracts';
import {
  catalogErrorStatus,
  getCatalogStore,
  requireManagerOrAdmin,
  requireWorkspaceMember,
  slideForMember,
  storageKind,
  toMappingView,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string; variantId: string }>;
}

/**
 * List a variant's Store SKU mappings (UTA-75, Story 01 — stub-ready).
 * GET /api/workspaces/:workspaceId/catalog/variants/:variantId/mappings
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
    const mappings = await listMappings(getCatalogStore(), {
      ctx: member.value.ctx,
      workspaceId: member.value.ctx.workspaceId,
      variantId,
    });
    return authJson(
      { mappings: mappings.map(toMappingView), storage: storageKind() },
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
 * Map a channel listing to a SKU TokoBoss (UTA-75, Story 01).
 * POST /api/workspaces/:workspaceId/catalog/variants/:variantId/mappings
 * (Manager/Admin). No live marketplace calls — the row is stub-ready for
 * Story 03–04. Double-mapped listings reject with 409.
 */
export async function POST(request: Request, { params }: RouteParams) {
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
  const parsed = CreateMappingBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'CATALOG_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const mapping = await createMapping(getCatalogStore(), {
      ctx: manager.value.ctx,
      workspaceId: manager.value.ctx.workspaceId,
      variantId,
      channel: parsed.data.channel,
      shopExtId: parsed.data.shopExtId,
      platformSkuId: parsed.data.platformSkuId,
      sellerSkuHint: parsed.data.sellerSkuHint,
      barcodeHint: parsed.data.barcodeHint,
      listingName: parsed.data.listingName,
    });
    log.info('catalog mapping created', {
      route:
        '/api/workspaces/[workspaceId]/catalog/variants/[variantId]/mappings',
      mappingId: mapping.id,
    });
    return authJson(
      { mapping: toMappingView(mapping), storage: storageKind() },
      201,
      requestId,
      correlationId,
      slideForMember(manager.value)
    );
  } catch (err) {
    const mapped = catalogErrorStatus(err);
    if (mapped.status === 500) {
      log.warn('catalog mapping create failed', {
        route:
          '/api/workspaces/[workspaceId]/catalog/variants/[variantId]/mappings',
        errorCode: mapped.errorCode,
      });
      return authJson(
        { error: 'Mapping failed.', errorCode: mapped.errorCode },
        500,
        requestId,
        correlationId
      );
    }
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Mapping failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
