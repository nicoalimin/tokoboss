import { searchCatalog } from '@tokoboss/application';
import {
  catalogErrorStatus,
  getCatalogStore,
  requireWorkspaceMember,
  slideForMember,
  storageKind,
  toProductView,
  toVariantView,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

/**
 * Catalog search (UTA-75, Story 01 — shared with UTA-28 scope).
 * GET /api/workspaces/:workspaceId/catalog/search?q=&limit=
 * (any active member; workspace-scoped).
 *
 * One query across product name, SKU TokoBoss, barcode, Store SKU hint
 * (`sellerSkuHint` / `platformSkuId`), and listing name (variant +
 * mapping). Case-insensitive substring.
 */
export async function GET(request: Request, { params }: RouteParams) {
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

  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

  try {
    const result = await searchCatalog(getCatalogStore(), {
      ctx: member.value.ctx,
      workspaceId: member.value.ctx.workspaceId,
      q,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return authJson(
      {
        products: result.products.map(toProductView),
        variants: result.variants.map((h) => ({
          ...toVariantView(h.variant),
          productId: h.productId,
          productName: h.productName,
        })),
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
        error: err instanceof Error ? err.message : 'Search failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
