import { transferStock } from '@tokoboss/application';
import { TransferStockBodySchema } from '@tokoboss/contracts';
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

/**
 * Stock transfer between warehouses (UTA-112, Story 07).
 * POST /api/workspaces/:workspaceId/catalog/variants/:variantId/transfers
 * (Manager/Admin within warehouse scope; Staff read-only).
 *
 * This endpoint allows transferring inventory from one warehouse to another
 * for a specific product variant. The transfer is tracked in the ledger
 * and maintains inventory consistency.
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

  const parsed = TransferStockBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'CATALOG_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const result = await transferStock(getCatalogStore(), {
      ctx: member.value.ctx,
      workspaceId: member.value.ctx.workspaceId,
      variantId,
      fromWarehouseId: parsed.data.fromWarehouseId,
      toWarehouseId: parsed.data.toWarehouseId,
      quantity: parsed.data.quantity,
      reason: parsed.data.reason,
      expectedVersion: parsed.data.expectedVersion,
      correlationId,
    });

    log.info('catalog stock transfer completed', {
      route:
        '/api/workspaces/[workspaceId]/catalog/variants/[variantId]/transfers',
      variantId,
      fromWarehouseId: result.fromLevel.warehouseId,
      toWarehouseId: result.toLevel.warehouseId,
    });

    return authJson(
      {
        fromLevel: {
          warehouseId: result.fromLevel.warehouseId,
          qty: result.fromLevel.qty,
          version: result.fromLevel.version,
        },
        toLevel: {
          warehouseId: result.toLevel.warehouseId,
          qty: result.toLevel.qty,
          version: result.toLevel.version,
        },
        entry: {
          id: result.entry.id,
          variantId: result.entry.variantId,
          warehouseId: result.entry.warehouseId,
          delta: result.entry.delta,
          reason: result.entry.reason,
          timestamp: result.entry.createdAt,
        },
        storage: storageKind(),
      },
      201,
      requestId,
      correlationId,
      slideForMember(member.value)
    );
  } catch (err) {
    const mapped = catalogErrorStatus(err);
    if (mapped.status === 500) {
      log.warn('catalog stock transfer failed', {
        route:
          '/api/workspaces/[workspaceId]/catalog/variants/[variantId]/transfers',
        errorCode: mapped.errorCode,
      });
      return authJson(
        { error: 'Transfer failed.', errorCode: mapped.errorCode },
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
        error: err instanceof Error ? err.message : 'Transfer failed.',
        errorCode: mapped.errorCode,
        ...(details !== undefined ? { details } : {}),
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
