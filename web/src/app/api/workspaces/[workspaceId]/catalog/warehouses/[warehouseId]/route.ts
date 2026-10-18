import { assertNoOpenCount, updateWarehouse } from '@tokoboss/application';
import { UpdateWarehouseBodySchema } from '@tokoboss/contracts';
import {
  catalogErrorStatus,
  getCatalogStore,
  requireManagerOrAdmin,
  slideForMember,
  storageKind,
  toWarehouseView,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';
import { getStockCountStore } from '@/lib/stock-count';
import { stockCountFailed } from '@/lib/stock-count-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string; warehouseId: string }>;
}

/**
 * Update a warehouse — rename or deactivate (UTA-75, Story 01).
 * PATCH /api/workspaces/:workspaceId/catalog/warehouses/:warehouseId
 * (Manager/Admin). Stale `expectedVersion` values reject with 409.
 * Deactivated warehouses reject adjustments instead of silently applying.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const { workspaceId, warehouseId } = await params;

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
  const parsed = UpdateWarehouseBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'CATALOG_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  // RFC 03 task 36 (US06): no deactivate while a stock opname is open.
  if (parsed.data.status === 'deactivated') {
    const ws = manager.value.ctx.workspaceId;
    try {
      const current = await getCatalogStore().findWarehouseById(
        ws,
        warehouseId
      );
      if (current) {
        await assertNoOpenCount(getStockCountStore(), {
          workspaceId: ws,
          warehouseId,
          warehouseName: current.name,
        });
      }
    } catch (err) {
      const ids: [string, string] = [requestId, correlationId];
      return stockCountFailed(err, ids, 'Warehouse update failed.');
    }
  }

  try {
    const warehouse = await updateWarehouse(getCatalogStore(), {
      ctx: manager.value.ctx,
      workspaceId: manager.value.ctx.workspaceId,
      warehouseId,
      name: parsed.data.name,
      status: parsed.data.status,
      expectedVersion: parsed.data.expectedVersion,
    });
    return authJson(
      { warehouse: toWarehouseView(warehouse), storage: storageKind() },
      200,
      requestId,
      correlationId,
      slideForMember(manager.value)
    );
  } catch (err) {
    const mapped = catalogErrorStatus(err);
    if (mapped.status === 500) {
      log.warn('catalog warehouse update failed', {
        route: '/api/workspaces/[workspaceId]/catalog/warehouses/[warehouseId]',
        errorCode: mapped.errorCode,
      });
      return authJson(
        { error: 'Warehouse update failed.', errorCode: mapped.errorCode },
        500,
        requestId,
        correlationId
      );
    }
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Warehouse update failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
