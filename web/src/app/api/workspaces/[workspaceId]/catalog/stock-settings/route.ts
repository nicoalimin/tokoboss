import { getStockSettings, updateStockSettings } from '@tokoboss/application';
import { UpdateStockSettingsBodySchema } from '@tokoboss/contracts';
import {
  catalogErrorStatus,
  getCatalogStore,
  requireWorkspaceMember,
  slideForMember,
  storageKind,
  toStockSettingsView,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

/**
 * Workspace stock policy (UTA-81, Story 05).
 * GET /api/workspaces/:workspaceId/catalog/stock-settings
 * (any active member; workspace-scoped).
 *
 * The negative-stock policy defaults to OFF — adjustments that would
 * drive a balance below zero reject with 422
 * `CATALOG_INSUFFICIENT_STOCK` until an Admin toggles it ON via PUT.
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
    const settings = await getStockSettings(getCatalogStore(), {
      ctx: member.value.ctx,
      workspaceId: member.value.ctx.workspaceId,
    });
    return authJson(
      { settings: toStockSettingsView(settings), storage: storageKind() },
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
 * PUT /api/workspaces/:workspaceId/catalog/stock-settings
 * (Admin only — Managers/Staff get the same generic 403 as non-members).
 * Compare-and-set on `expectedVersion`; stale writes reject with 409
 * `CATALOG_VERSION_CONFLICT` (+ `currentVersion`).
 */
export async function PUT(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
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

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = UpdateStockSettingsBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'CATALOG_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const settings = await updateStockSettings(getCatalogStore(), {
      ctx: member.value.ctx,
      workspaceId: member.value.ctx.workspaceId,
      allowNegative: parsed.data.allowNegative,
      expectedVersion: parsed.data.expectedVersion,
    });
    return authJson(
      { settings: toStockSettingsView(settings), storage: storageKind() },
      200,
      requestId,
      correlationId,
      slideForMember(member.value)
    );
  } catch (err) {
    const mapped = catalogErrorStatus(err);
    if (mapped.status === 500) {
      log.warn('catalog stock settings update failed', {
        route: '/api/workspaces/[workspaceId]/catalog/stock-settings',
        errorCode: mapped.errorCode,
      });
      return authJson(
        { error: 'Catalog update failed.', errorCode: mapped.errorCode },
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
        error: err instanceof Error ? err.message : 'Catalog update failed.',
        errorCode: mapped.errorCode,
        ...(details !== undefined ? { details } : {}),
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
