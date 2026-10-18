/**
 * Stock-opname session actions (US12 / RFC 03 task 34).
 * POST /api/workspaces/:workspaceId/stock-counts/:sessionId/actions
 * Body: { action: submit|return|cancel|freeze, expectedVersion, note?, freeze? }
 *
 * Any active member (RFC 02 neutral 404). Role gates (403), warehouse scope
 * (404 STOCK_COUNT_NOT_FOUND), required notes, the state machine and
 * expectedVersion conflicts are enforced by the use cases. Returns 200 with
 * the updated session; freeze without a `freeze` boolean is a 400.
 */
import {
  cancelStockCount,
  returnStockCount,
  setStockCountFreeze,
  submitStockCount,
} from '@tokoboss/application';
import { StockCountActionBodySchema } from '@tokoboss/contracts';
import { getAuthAudit } from '@/lib/auth';
import { authJson, routeContext } from '@/lib/auth-routes';
import { getStockCountStore, storageKind } from '@/lib/stock-count';
import {
  admitStockCountMember,
  stockCountDenied,
  stockCountFailed,
  stockCountInvalid,
  type RouteIds,
} from '@/lib/stock-count-routes';
import { toStockCountSessionView } from '@/lib/stock-count-views';

interface RouteParams {
  params: Promise<{ workspaceId: string; sessionId: string }>;
}

const TRANSITIONS = {
  submit: submitStockCount,
  return: returnStockCount,
  cancel: cancelStockCount,
} as const;

export async function POST(request: Request, { params }: RouteParams) {
  const { requestId, correlationId } = routeContext(request);
  const ids: RouteIds = [requestId, correlationId];
  const { workspaceId, sessionId } = await params;
  const admitted = await admitStockCountMember(request, workspaceId);
  if (!admitted.ok) return stockCountDenied(admitted.denial, ids);
  const parsed = StockCountActionBodySchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) return stockCountInvalid(ids);
  const { action, expectedVersion, note, freeze } = parsed.data;
  if (action === 'freeze' && freeze === undefined) {
    return stockCountInvalid(ids);
  }
  try {
    const deps = { store: getStockCountStore(), audit: getAuthAudit() };
    const base = {
      ctx: admitted.ctx,
      workspaceId,
      sessionId,
      expectedVersion,
      now: new Date(),
    };
    const session =
      action === 'freeze'
        ? await setStockCountFreeze(deps, { ...base, freeze: freeze === true })
        : await TRANSITIONS[action](deps, { ...base, note });
    const body = {
      session: toStockCountSessionView(session),
      storage: storageKind(),
    };
    return authJson(body, 200, ...ids, admitted.cookie);
  } catch (err) {
    return stockCountFailed(err, ids, 'Stock count action failed.');
  }
}
