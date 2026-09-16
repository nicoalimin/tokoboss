import { adjustStock } from '@tokoboss/application';
import { AdjustStockBodySchema } from '@tokoboss/contracts';
import {
  catalogErrorStatus,
  getCatalogStore,
  requireManagerOrAdmin,
  slideForMember,
  storageKind,
  toLedgerView,
  toLevelView,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string; variantId: string }>;
}

/**
 * Warehouse stock adjustment (UTA-81, Story 05).
 * POST /api/workspaces/:workspaceId/catalog/variants/:variantId/adjustments
 * (Manager/Admin within warehouse scope; Staff read-only).
 *
 * A quantity change is only valid with warehouse + reason + save: the
 * server appends one ledger entry (the stock SoT) and advances the level
 * read model. There is no draft/pending state server-side. Deactivated
 * warehouses, oversell (unless the Admin-only negative-stock toggle is
 * ON), and stale `expectedVersion` values reject instead of silently
 * applying. Retried requests with the same `idempotencyKey` resolve to
 * the original entry (no double-apply); the response carries
 * `deduplicated: true` in that case.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const { workspaceId, variantId } = await params;

  const member = await requireManagerOrAdmin(request, workspaceId);
  if (!member.ok) {
    return authJson(
      { error: member.denial.error, errorCode: member.denial.errorCode },
      member.denial.status,
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
  const parsed = AdjustStockBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'CATALOG_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const result = await adjustStock(getCatalogStore(), {
      ctx: member.value.ctx,
      workspaceId: member.value.ctx.workspaceId,
      variantId,
      warehouseId: parsed.data.warehouseId,
      delta: parsed.data.delta,
      reason: parsed.data.reason,
      expectedVersion: parsed.data.expectedVersion,
      idempotencyKey: parsed.data.idempotencyKey,
      correlationId,
    });
    log.info('catalog stock adjusted', {
      route:
        '/api/workspaces/[workspaceId]/catalog/variants/[variantId]/adjustments',
      variantId,
    });
    return authJson(
      {
        level: toLevelView(result.level),
        entry: toLedgerView(result.entry),
        ...(result.deduplicated === true ? { deduplicated: true } : {}),
        storage: storageKind(),
      },
      result.deduplicated === true ? 200 : 201,
      requestId,
      correlationId,
      slideForMember(member.value)
    );
  } catch (err) {
    const mapped = catalogErrorStatus(err);
    if (mapped.status === 500) {
      log.warn('catalog stock adjustment failed', {
        route:
          '/api/workspaces/[workspaceId]/catalog/variants/[variantId]/adjustments',
        errorCode: mapped.errorCode,
      });
      return authJson(
        { error: 'Adjustment failed.', errorCode: mapped.errorCode },
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
        error: err instanceof Error ? err.message : 'Adjustment failed.',
        errorCode: mapped.errorCode,
        ...(details !== undefined ? { details } : {}),
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
