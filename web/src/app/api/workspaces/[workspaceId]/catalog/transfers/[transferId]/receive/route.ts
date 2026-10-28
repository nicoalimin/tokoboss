import { receiveTransferUseCase } from '@tokoboss/application';
import { ReceiveTransferBodySchema } from '@tokoboss/contracts';
import {
  catalogErrorStatus,
  getCatalogStore,
  requireManagerOrAdmin,
  slideForMember,
  storageKind,
  toTransferWithItemsView,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';
import { triggerVariantInventorySync } from '@/lib/inventory-sync';

interface RouteParams {
  params: Promise<{ workspaceId: string; transferId: string }>;
}

/**
 * Receive a transfer (UTA-127).
 * POST /api/workspaces/:workspaceId/catalog/transfers/:transferId/receive
 * (Manager/Admin only).
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
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
  const parsed = ReceiveTransferBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'CATALOG_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const result = await receiveTransferUseCase(getCatalogStore(), {
      ctx: manager.value.ctx,
      workspaceId: manager.value.ctx.workspaceId,
      transferId,
      expectedVersion: parsed.data.expectedVersion,
      idempotencyKey: parsed.data.idempotencyKey,
      items: parsed.data.items,
    });
    // Best-effort marketplace stock push (US04 / RFC 06 row 41); never throws.
    const variantIds = [...new Set(result.items.map((i) => i.variantId))];
    const { workspaceId: ws, userId: actorId } = manager.value.ctx;
    const sync = { workspaceId: ws, variantIds, correlationId, actorId };
    const trigger = 'transfer_receive' as const;
    await triggerVariantInventorySync({ ...sync, trigger }, log);
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
        error:
          err instanceof Error ? err.message : 'Receiving transfer failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
