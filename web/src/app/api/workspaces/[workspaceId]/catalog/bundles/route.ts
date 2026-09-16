import { createBundle, listBundles } from '@tokoboss/application';
import { CreateBundleBodySchema } from '@tokoboss/contracts';
import {
  getCatalogStore,
  storageKind,
  requireManagerOrAdmin,
  requireWorkspaceMember,
  slideForMember,
  toBundleSummaryView,
  toBundleView,
  catalogErrorStatus,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

/**
 * List bundle BOMs with components (UTA-79, Story 13).
 * GET /api/workspaces/:workspaceId/catalog/bundles?limit=
 * (any active member; workspace-scoped).
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
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

  try {
    const bundles = await listBundles(getCatalogStore(), {
      ctx: member.value.ctx,
      workspaceId: member.value.ctx.workspaceId,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return authJson(
      { bundles: bundles.map(toBundleSummaryView), storage: storageKind() },
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
 * Define the BOM of a bundle variant (UTA-79, Story 13).
 * POST /api/workspaces/:workspaceId/catalog/bundles (Manager/Admin).
 *
 * The bundle shell and every component must be active variants;
 * self-references and transitive cycles reject with 422 `BUNDLE_CYCLE`.
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
  const parsed = CreateBundleBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'BUNDLE_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const created = await createBundle(getCatalogStore(), {
      ctx: manager.value.ctx,
      workspaceId: manager.value.ctx.workspaceId,
      bundleVariantId: parsed.data.bundleVariantId,
      components: parsed.data.components,
      expectedVersion: parsed.data.expectedVersion,
    });
    log.info('bundle BOM created', {
      route: '/api/workspaces/[workspaceId]/catalog/bundles',
      bundleVariantId: created.bundle.id,
    });
    return authJson(
      { bundle: toBundleView(created), storage: storageKind() },
      201,
      requestId,
      correlationId,
      slideForMember(manager.value)
    );
  } catch (err) {
    const mapped = catalogErrorStatus(err);
    if (mapped.status === 500) {
      log.warn('bundle BOM create failed', {
        route: '/api/workspaces/[workspaceId]/catalog/bundles',
        errorCode: mapped.errorCode,
      });
      return authJson(
        { error: 'Bundle create failed.', errorCode: mapped.errorCode },
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
        error: err instanceof Error ? err.message : 'Bundle create failed.',
        errorCode: mapped.errorCode,
        ...(details !== undefined ? { details } : {}),
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
