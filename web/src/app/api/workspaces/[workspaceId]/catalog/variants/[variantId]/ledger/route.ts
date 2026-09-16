import { getLedger } from '@tokoboss/application';
import {
  catalogErrorStatus,
  getCatalogStore,
  requireWorkspaceMember,
  slideForMember,
  storageKind,
  toLedgerView,
} from '@/lib/catalog';
import { authJson, routeContext } from '@/lib/auth-routes';

interface RouteParams {
  params: Promise<{ workspaceId: string; variantId: string }>;
}

/**
 * Stock ledger timeline, newest-first (UTA-75, Story 01).
 * GET /api/workspaces/:workspaceId/catalog/variants/:variantId/ledger?limit=
 * (any active member; workspace-scoped).
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const { workspaceId, variantId } = await params;

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
    const entries = await getLedger(getCatalogStore(), {
      ctx: member.value.ctx,
      workspaceId: member.value.ctx.workspaceId,
      variantId,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return authJson(
      { entries: entries.map(toLedgerView), storage: storageKind() },
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
