import {
  createTransferDraftUseCase,
  listTransfersUseCase,
} from '@tokoboss/application';
import { CreateTransferDraftBodySchema } from '@tokoboss/contracts';
import {
  catalogErrorStatus,
  getCatalogStore,
  requireManagerOrAdmin,
  requireWorkspaceMember,
  slideForMember,
  storageKind,
  toTransferView,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

/**
 * List transfers (UTA-124).
 * GET /api/workspaces/:workspaceId/catalog/transfers
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
    const transfers = await listTransfersUseCase(getCatalogStore(), {
      ctx: member.value.ctx,
      workspaceId: member.value.ctx.workspaceId,
    });
    return authJson(
      {
        transfers: transfers.map((t) => toTransferView(t.transfer)),
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
 * Create a transfer draft (UTA-124).
 * POST /api/workspaces/:workspaceId/catalog/transfers (Manager/Admin).
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
  const parsed = CreateTransferDraftBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'CATALOG_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const transfer = await createTransferDraftUseCase(getCatalogStore(), {
      ctx: manager.value.ctx,
      workspaceId: manager.value.ctx.workspaceId,
      referenceNum: parsed.data.referenceNum,
      sourceWarehouseId: parsed.data.sourceWarehouseId,
      destWarehouseId: parsed.data.destWarehouseId,
      notes: parsed.data.notes,
      expectedReceiveDate: parsed.data.expectedReceiveDate
        ? new Date(parsed.data.expectedReceiveDate)
        : undefined,
    });
    log.info('catalog transfer draft created', {
      route: '/api/workspaces/[workspaceId]/catalog/transfers',
      transferId: transfer.id,
    });
    return authJson(
      { transfer: toTransferView(transfer), storage: storageKind() },
      201,
      requestId,
      correlationId,
      slideForMember(manager.value)
    );
  } catch (err) {
    const mapped = catalogErrorStatus(err);
    if (mapped.status === 500) {
      log.warn('catalog transfer draft create failed', {
        route: '/api/workspaces/[workspaceId]/catalog/transfers',
        errorCode: mapped.errorCode,
      });
      return authJson(
        { error: 'Transfer draft create failed.', errorCode: mapped.errorCode },
        500,
        requestId,
        correlationId
      );
    }
    return authJson(
      {
        error:
          err instanceof Error ? err.message : 'Transfer draft create failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
