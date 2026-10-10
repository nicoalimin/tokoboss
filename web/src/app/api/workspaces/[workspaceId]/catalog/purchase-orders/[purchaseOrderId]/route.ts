import { updatePurchaseOrderDraft } from '@tokoboss/application';
import { UpdatePurchaseOrderDraftBodySchema } from '@tokoboss/contracts';
import {
  catalogErrorStatus,
  getCatalogStore,
  requireManagerOrAdmin,
  slideForMember,
  storageKind,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';
import { toPurchaseOrderWithItemsView } from '@/lib/purchase-order-view';

interface RouteParams {
  params: Promise<{ workspaceId: string; purchaseOrderId: string }>;
}

const ROUTE =
  '/api/workspaces/[workspaceId]/catalog/purchase-orders/[purchaseOrderId]';

/**
 * Edit a DRAFT purchase order (UTA-146 Slice 1j / Story 11 — draft only).
 * PATCH /api/workspaces/:workspaceId/catalog/purchase-orders/:purchaseOrderId
 * (Manager/Admin). Replaces supplier, notes, and the full item list with CAS
 * on `expectedVersion`. Missing supplier / unit cost stay null — never
 * invented. PO send/receive is Story 10.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const { workspaceId, purchaseOrderId } = await params;

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
  const parsed = UpdatePurchaseOrderDraftBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'CATALOG_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const result = await updatePurchaseOrderDraft(getCatalogStore(), {
      ctx: manager.value.ctx,
      workspaceId: manager.value.ctx.workspaceId,
      purchaseOrderId,
      expectedVersion: parsed.data.expectedVersion,
      supplierName: parsed.data.supplierName ?? null,
      notes: parsed.data.notes ?? null,
      items: parsed.data.items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        unitCostCents: item.unitCostCents ?? null,
      })),
    });
    log.info('catalog purchase order draft updated', {
      route: ROUTE,
      purchaseOrderId: result.purchaseOrder.id,
    });
    return authJson(
      { ...toPurchaseOrderWithItemsView(result), storage: storageKind() },
      200,
      requestId,
      correlationId,
      slideForMember(manager.value)
    );
  } catch (err) {
    const mapped = catalogErrorStatus(err);
    if (mapped.status === 500) {
      log.warn('catalog purchase order draft update failed', {
        route: ROUTE,
        errorCode: mapped.errorCode,
      });
    }
    const details =
      mapped.status !== 500 &&
      typeof err === 'object' &&
      err !== null &&
      'details' in err
        ? (err as { details?: Record<string, unknown> }).details
        : undefined;
    return authJson(
      {
        error:
          mapped.status !== 500 && err instanceof Error
            ? err.message
            : 'Purchase order draft update failed.',
        errorCode: mapped.errorCode,
        ...(details !== undefined ? { details } : {}),
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
