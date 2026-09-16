import { createWarehouse, listWarehouses } from '@tokoboss/application';
import { CreateWarehouseBodySchema } from '@tokoboss/contracts';
import {
  catalogErrorStatus,
  getCatalogStore,
  requireManagerOrAdmin,
  requireWorkspaceMember,
  slideForMember,
  storageKind,
  toWarehouseView,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

/**
 * List warehouses (UTA-75, Story 01).
 * GET /api/workspaces/:workspaceId/catalog/warehouses
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

  try {
    const warehouses = await listWarehouses(getCatalogStore(), {
      ctx: member.value.ctx,
      workspaceId: member.value.ctx.workspaceId,
    });
    return authJson(
      {
        warehouses: warehouses.map(toWarehouseView),
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
 * Create a warehouse (UTA-75, Story 01).
 * POST /api/workspaces/:workspaceId/catalog/warehouses (Manager/Admin).
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
  const parsed = CreateWarehouseBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'CATALOG_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const warehouse = await createWarehouse(getCatalogStore(), {
      ctx: manager.value.ctx,
      workspaceId: manager.value.ctx.workspaceId,
      code: parsed.data.code,
      name: parsed.data.name,
    });
    log.info('catalog warehouse created', {
      route: '/api/workspaces/[workspaceId]/catalog/warehouses',
      warehouseId: warehouse.id,
    });
    return authJson(
      { warehouse: toWarehouseView(warehouse), storage: storageKind() },
      201,
      requestId,
      correlationId,
      slideForMember(manager.value)
    );
  } catch (err) {
    const mapped = catalogErrorStatus(err);
    if (mapped.status === 500) {
      log.warn('catalog warehouse create failed', {
        route: '/api/workspaces/[workspaceId]/catalog/warehouses',
        errorCode: mapped.errorCode,
      });
      return authJson(
        { error: 'Warehouse create failed.', errorCode: mapped.errorCode },
        500,
        requestId,
        correlationId
      );
    }
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Warehouse create failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
