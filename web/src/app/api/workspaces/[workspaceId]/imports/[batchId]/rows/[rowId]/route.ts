import { updateImportRow } from '@tokoboss/application';
import { PatchImportRowBodySchema } from '@tokoboss/contracts';
import {
  getImportStore,
  importErrorStatus,
  requireManagerOrAdmin,
  slideForMember,
  storageKind,
  toImportRowView,
} from '@/lib/imports';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string; batchId: string; rowId: string }>;
}

/**
 * Review edit / reject for one import candidate row (UTA-77).
 * PATCH /api/workspaces/:workspaceId/imports/:batchId/rows/:rowId
 * (Manager/Admin; only while the batch is draft/review and the row is
 * not applied).
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const { workspaceId, batchId, rowId } = await params;

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
  const parsed = PatchImportRowBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'IMPORT_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const row = await updateImportRow(getImportStore(), {
      ctx: manager.value.ctx,
      workspaceId: manager.value.ctx.workspaceId,
      batchId,
      rowId,
      patch: parsed.data,
    });
    log.info('product import row updated', {
      route: '/api/workspaces/[workspaceId]/imports/[batchId]/rows/[rowId]',
      batchId,
      rowId: row.id,
    });
    return authJson(
      { row: toImportRowView(row), storage: storageKind() },
      200,
      requestId,
      correlationId,
      slideForMember(manager.value)
    );
  } catch (err) {
    const mapped = importErrorStatus(err);
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Import row update failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
