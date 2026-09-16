import {
  getImportBatch,
  reopenImportBatch,
  rejectImportBatch,
} from '@tokoboss/application';
import { PatchImportBatchBodySchema } from '@tokoboss/contracts';
import {
  getImportStore,
  importErrorStatus,
  requireManagerOrAdmin,
  requireWorkspaceMember,
  slideForMember,
  storageKind,
  toImportBatchView,
} from '@/lib/imports';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string; batchId: string }>;
}

/**
 * Import batch detail with reviewable rows (UTA-77, Story 02).
 * GET /api/workspaces/:workspaceId/imports/:batchId
 * (any active member; workspace-scoped).
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const { workspaceId, batchId } = await params;

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
    const detail = await getImportBatch(getImportStore(), {
      ctx: member.value.ctx,
      workspaceId: member.value.ctx.workspaceId,
      batchId,
    });
    return authJson(
      {
        batch: toImportBatchView(detail.batch, detail.rows),
        storage: storageKind(),
      },
      200,
      requestId,
      correlationId,
      slideForMember(member.value)
    );
  } catch (err) {
    const mapped = importErrorStatus(err);
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Import read failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}

/**
 * Batch-level review actions (UTA-77).
 * PATCH /api/workspaces/:workspaceId/imports/:batchId (Manager/Admin).
 * `{ action: "reject" }` discards the batch; `{ action: "reopen" }`
 * returns a rejected batch to draft/review.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const { requestId, correlationId, log } = routeContext(request);
  const { workspaceId, batchId } = await params;

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
  const parsed = PatchImportBatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'IMPORT_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const store = getImportStore();
    const ctx = {
      ctx: manager.value.ctx,
      workspaceId: manager.value.ctx.workspaceId,
      batchId,
    };
    const batch =
      parsed.data.action === 'reject'
        ? await rejectImportBatch(store, ctx)
        : await reopenImportBatch(store, ctx);
    log.info('product import batch updated', {
      route: '/api/workspaces/[workspaceId]/imports/[batchId]',
      batchId: batch.id,
    });
    return authJson(
      { batch: toImportBatchView(batch), storage: storageKind() },
      200,
      requestId,
      correlationId,
      slideForMember(manager.value)
    );
  } catch (err) {
    const mapped = importErrorStatus(err);
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Import update failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
