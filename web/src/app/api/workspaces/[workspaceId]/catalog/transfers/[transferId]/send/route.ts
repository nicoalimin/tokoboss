import {
  assertNoOutboundFreeze,
  sendTransferUseCase,
} from '@tokoboss/application';
import { SendTransferBodySchema } from '@tokoboss/contracts';
import {
  catalogErrorStatus,
  getCatalogStore,
  requireManagerOrAdmin,
  slideForMember,
  storageKind,
  toTransferWithItemsView,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';
import { getStockCountStore } from '@/lib/stock-count';
import { stockCountFailed } from '@/lib/stock-count-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string; transferId: string }>;
}

/**
 * Send a transfer (UTA-126).
 * POST /api/workspaces/:workspaceId/catalog/transfers/:transferId/send
 * (Manager/Admin only).
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const { workspaceId, transferId } = await params;

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
  const parsed = SendTransferBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'CATALOG_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  // RFC 03 task 37 (D2): no outbound send while the source is frozen.
  const ws = manager.value.ctx.workspaceId;
  try {
    const transfer = await getCatalogStore().findTransferById(ws, transferId);
    if (transfer) {
      await assertNoOutboundFreeze(getStockCountStore(), {
        workspaceId: ws,
        warehouseId: transfer.sourceWarehouseId,
      });
    }
  } catch (err) {
    const ids: [string, string] = [requestId, correlationId];
    return stockCountFailed(err, ids, 'Sending transfer failed.');
  }

  try {
    const result = await sendTransferUseCase(getCatalogStore(), {
      ctx: manager.value.ctx,
      workspaceId: manager.value.ctx.workspaceId,
      transferId,
      expectedVersion: parsed.data.expectedVersion,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    return authJson(
      { ...toTransferWithItemsView(result), storage: storageKind() },
      200,
      requestId,
      correlationId,
      slideForMember(manager.value)
    );
  } catch (err) {
    const mapped = catalogErrorStatus(err);
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Sending transfer failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
