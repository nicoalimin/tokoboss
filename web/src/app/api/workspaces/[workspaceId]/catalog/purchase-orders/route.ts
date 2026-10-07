import {
  createPurchaseOrderDraft,
  type PurchaseOrderWithItems,
} from '@tokoboss/application';
import {
  CreatePurchaseOrderDraftBodySchema,
  type PurchaseOrderWithItemsView,
} from '@tokoboss/contracts';
import {
  catalogErrorStatus,
  getCatalogStore,
  requireManagerOrAdmin,
  slideForMember,
  storageKind,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

function toPurchaseOrderWithItemsView(
  result: PurchaseOrderWithItems
): PurchaseOrderWithItemsView {
  const po = result.purchaseOrder;
  return {
    purchaseOrder: {
      id: po.id,
      workspaceId: po.workspaceId,
      referenceNum: po.referenceNum,
      status: po.status,
      supplierName: po.supplierName,
      notes: po.notes,
      version: po.version,
      createdAt: po.createdAt.toISOString(),
      updatedAt: po.updatedAt.toISOString(),
    },
    items: result.items.map((item) => ({
      id: item.id,
      purchaseOrderId: item.purchaseOrderId,
      workspaceId: item.workspaceId,
      variantId: item.variantId,
      quantity: item.quantity,
      unitCostCents: item.unitCostCents,
      version: item.version,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
  };
}

/**
 * Create a draft purchase order from low-stock recommendations
 * (UTA-146 Slice 1d / Story 11 — draft only).
 * POST /api/workspaces/:workspaceId/catalog/purchase-orders (Manager/Admin).
 * Missing supplier / unit cost stay null — never invented. PO send/receive
 * is Story 10.
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
  const parsed = CreatePurchaseOrderDraftBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'CATALOG_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const result = await createPurchaseOrderDraft(getCatalogStore(), {
      ctx: manager.value.ctx,
      workspaceId: manager.value.ctx.workspaceId,
      referenceNum: parsed.data.referenceNum,
      supplierName: parsed.data.supplierName ?? null,
      notes: parsed.data.notes ?? null,
      items: parsed.data.items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        unitCostCents: item.unitCostCents ?? null,
      })),
    });
    log.info('catalog purchase order draft created', {
      route: '/api/workspaces/[workspaceId]/catalog/purchase-orders',
      purchaseOrderId: result.purchaseOrder.id,
    });
    return authJson(
      { ...toPurchaseOrderWithItemsView(result), storage: storageKind() },
      201,
      requestId,
      correlationId,
      slideForMember(manager.value)
    );
  } catch (err) {
    const mapped = catalogErrorStatus(err);
    if (mapped.status === 500) {
      log.warn('catalog purchase order draft create failed', {
        route: '/api/workspaces/[workspaceId]/catalog/purchase-orders',
        errorCode: mapped.errorCode,
      });
      return authJson(
        {
          error: 'Purchase order draft create failed.',
          errorCode: mapped.errorCode,
        },
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
        error:
          err instanceof Error
            ? err.message
            : 'Purchase order draft create failed.',
        errorCode: mapped.errorCode,
        ...(details !== undefined ? { details } : {}),
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
