import { createImportBatch, listImportBatches } from '@tokoboss/application';
import { CreateImportBodySchema } from '@tokoboss/contracts';
import {
  getImportJobs,
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
  params: Promise<{ workspaceId: string }>;
}

/**
 * List import batches (UTA-77, Story 02).
 * GET /api/workspaces/:workspaceId/imports?limit=
 * (any active member; workspace-scoped, newest first).
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

  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

  try {
    const batches = await listImportBatches(getImportStore(), {
      ctx: member.value.ctx,
      workspaceId: member.value.ctx.workspaceId,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return authJson(
      {
        batches: batches.map((b) => toImportBatchView(b)),
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
 * Upload + parse (UTA-77 step 2).
 * POST /api/workspaces/:workspaceId/imports (Manager/Admin).
 *
 * Body: `{ filename, contentType, content? (CSV text), rows? (pre-parsed),
 * idempotencyKey? }`. Exactly one of `content`/`rows` is required —
 * xlsx/photo/PDF converters submit `rows` (the server never parses binary
 * formats). A retry with the same `idempotencyKey` resolves to the existing
 * batch (`duplicate: true`) instead of double-parsing.
 *
 * Marketplace Store SKU columns become mapping candidates only — they never
 * replace the SKU TokoBoss identity.
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
  const parsed = CreateImportBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'IMPORT_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const created = await createImportBatch(
      getImportStore(),
      {
        ctx: manager.value.ctx,
        workspaceId: manager.value.ctx.workspaceId,
        filename: parsed.data.filename,
        contentType: parsed.data.contentType,
        content: parsed.data.content,
        rows: parsed.data.rows,
        idempotencyKey: parsed.data.idempotencyKey,
      },
      getImportJobs()
    );
    // Confirm writes through the shared catalog store (memory vs
    // DATABASE_URL, same wiring as `@/lib/catalog`); see the confirm route.
    log.info('product import batch created', {
      route: '/api/workspaces/[workspaceId]/imports',
      batchId: created.batch.id,
      duplicate: created.duplicate,
    });
    return authJson(
      {
        batch: toImportBatchView(created.batch, created.rows),
        duplicate: created.duplicate,
        jobId: created.jobId,
        storage: storageKind(),
      },
      created.duplicate ? 200 : 201,
      requestId,
      correlationId,
      slideForMember(manager.value)
    );
  } catch (err) {
    const mapped = importErrorStatus(err);
    if (mapped.status === 500) {
      log.warn('product import create failed', {
        route: '/api/workspaces/[workspaceId]/imports',
        errorCode: mapped.errorCode,
      });
      return authJson(
        { error: 'Import create failed.', errorCode: mapped.errorCode },
        500,
        requestId,
        correlationId
      );
    }
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Import create failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
