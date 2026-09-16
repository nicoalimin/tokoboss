import { confirmImportBatch } from '@tokoboss/application';
import { ConfirmImportBodySchema } from '@tokoboss/contracts';
import {
  catalogErrorStatus,
  getImportCatalogStore,
  getImportStore,
  importErrorStatus,
  requireManagerOrAdmin,
  slideForMember,
  storageKind,
  toConfirmView,
} from '@/lib/imports';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string; batchId: string }>;
}

/**
 * Review/confirm (UTA-77 step 3).
 * POST /api/workspaces/:workspaceId/imports/:batchId/confirm
 * (Manager/Admin).
 *
 * Apply creates Product/SKU TokoBoss rows through the catalog use-cases
 * (every UTA-75 rule still applies). Duplicate SKU codes surface
 * `duplicates[]` with `existingPath` and mark those rows rejected — the
 * existing catalog row is never overwritten. Marketplace Store SKU text
 * lands in `catalog_channel_mappings` as a candidate (no live channel
 * calls). Optional `{ rowIds }` confirms a subset; re-confirming is safe
 * (applied rows are skipped, empty selections answer 409).
 */
export async function POST(request: Request, { params }: RouteParams) {
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
  const parsed = ConfirmImportBodySchema.safeParse(body);
  if (!parsed.success) {
    return authJson(
      { error: 'Invalid request.', errorCode: 'IMPORT_VALIDATION' },
      400,
      requestId,
      correlationId
    );
  }

  try {
    const result = await confirmImportBatch(
      getImportStore(),
      getImportCatalogStore(),
      {
        ctx: manager.value.ctx,
        workspaceId: manager.value.ctx.workspaceId,
        batchId,
        rowIds: parsed.data.rowIds,
      }
    );
    log.info('product import batch confirmed', {
      route: '/api/workspaces/[workspaceId]/imports/[batchId]/confirm',
      batchId: result.batch.id,
      applied: result.applied.length,
      duplicates: result.duplicates.length,
    });
    const view = toConfirmView(result);
    return authJson(
      { ...view, storage: storageKind() },
      200,
      requestId,
      correlationId,
      slideForMember(manager.value)
    );
  } catch (err) {
    // Catalog-rule failures (e.g. a SKU race) keep catalog semantics:
    // prefer the catalog status mapping when the code is catalog-owned.
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code: unknown }).code)
        : '';
    const mapped = code.startsWith('CATALOG_')
      ? catalogErrorStatus(err)
      : importErrorStatus(err);
    if (mapped.status === 500) {
      log.warn('product import confirm failed', {
        route: '/api/workspaces/[workspaceId]/imports/[batchId]/confirm',
        errorCode: mapped.errorCode,
      });
      return authJson(
        { error: 'Import confirm failed.', errorCode: mapped.errorCode },
        500,
        requestId,
        correlationId
      );
    }
    return authJson(
      {
        error: err instanceof Error ? err.message : 'Import confirm failed.',
        errorCode: mapped.errorCode,
      },
      mapped.status,
      requestId,
      correlationId
    );
  }
}
