import type { WorkspaceContext } from '../tenancy/tenancy-types';
import { assertSameWorkspace } from '../tenancy/workspace-context';
import { stockCountValidation } from './stock-count-errors';
import type { StockCountStore } from './stock-count-ports';
import type { StockCountStatus } from './stock-count-rules';
import type { StockCountScopeType } from './stock-count-types';

/**
 * List stock-opname sessions (US12 / RFC 03 task 17a). Any member: Admin
 * or an unscoped member sees every warehouse, a scoped Manager/Staff only
 * their own. Newest activity first. Rows carry the step actors and
 * `selfApproved` (list badge) and `stale` (open, no activity for 7 days,
 * the "kedaluwarsa" label). No Rp values here.
 */
export const STOCK_COUNT_STATUSES: readonly StockCountStatus[] = [
  'counting',
  'submitted',
  'posted',
  'cancelled',
];

export const STOCK_COUNT_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export interface StockCountListItem {
  id: string;
  code: string;
  name: string;
  warehouseId: string;
  scopeType: StockCountScopeType;
  status: StockCountStatus;
  freezeOutboundTransfers: boolean;
  createdBy: string;
  submittedBy: string | null;
  postedBy: string | null;
  cancelledBy: string | null;
  selfApproved: boolean;
  stale: boolean;
  snapshotAt: Date;
  lastActivityAt: Date;
  version: number;
}

export async function listStockCounts(
  deps: { store: Pick<StockCountStore, 'listSessions'> },
  input: {
    ctx: WorkspaceContext;
    workspaceId: string;
    statuses?: StockCountStatus[];
    now: Date;
  }
): Promise<StockCountListItem[]> {
  const { ctx, workspaceId, now } = input;
  assertSameWorkspace(ctx, workspaceId);
  const statuses = input.statuses ?? [];
  if (statuses.some((s) => !STOCK_COUNT_STATUSES.includes(s))) {
    throw stockCountValidation('Status sesi tidak valid.');
  }
  const warehouseIds =
    ctx.role === 'admin' || ctx.warehouseScope === null
      ? null
      : [ctx.warehouseScope];
  const sessions = await deps.store.listSessions({
    workspaceId,
    warehouseIds,
    ...(statuses.length > 0 ? { statuses } : {}),
  });
  return sessions
    .map((s) => {
      const status = s.status as StockCountStatus;
      const open = status === 'counting' || status === 'submitted';
      return {
        id: s.id,
        code: s.code,
        name: s.name,
        warehouseId: s.warehouseId,
        scopeType: s.scopeType,
        status,
        freezeOutboundTransfers: s.freezeOutboundTransfers,
        createdBy: s.createdBy,
        submittedBy: s.submittedBy,
        postedBy: s.postedBy,
        cancelledBy: s.cancelledBy,
        selfApproved: s.selfApproved,
        stale:
          open &&
          now.getTime() - s.lastActivityAt.getTime() >= STOCK_COUNT_STALE_MS,
        snapshotAt: s.snapshotAt,
        lastActivityAt: s.lastActivityAt,
        version: s.version,
      };
    })
    .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
}
