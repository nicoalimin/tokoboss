import { assertManagerOrAdmin } from '../tenancy/workspace-context';
import { stockCountValidation } from './stock-count-errors';
import {
  cleanNote,
  loadScopedSession,
  requireTransition,
  type StockCountTransitionDeps,
  type StockCountTransitionInput,
} from './stock-count-transition-helpers';
import type { StockCountSessionRecord } from './stock-count-types';

/**
 * Cancel / freeze toggle (US12 / RFC 03 task 13c). Cancel: Manager/Admin
 * from counting or submitted, or the creator while counting; reason
 * required; closes every line with no stock change. Freeze: Manager/Admin,
 * counting only. Each records its actor and emits its audit event.
 */
export async function cancelStockCount(
  deps: StockCountTransitionDeps,
  input: StockCountTransitionInput
): Promise<StockCountSessionRecord> {
  const { ctx, workspaceId, now } = input;
  const session = await loadScopedSession(
    deps.store,
    ctx,
    workspaceId,
    input.sessionId
  );
  const ownCounting =
    session.createdBy === ctx.userId && session.status === 'counting';
  if (!ownCounting) assertManagerOrAdmin(ctx);
  const from = requireTransition(session, 'cancel');
  const reason = cleanNote(input.note);
  if (reason === null) throw stockCountValidation('Alasan pembatalan wajib.');
  const updated = await deps.store.updateSession({
    workspaceId,
    sessionId: session.id,
    expectedVersion: input.expectedVersion,
    expectedStatus: from,
    changes: {
      status: 'cancelled',
      cancelledBy: ctx.userId,
      cancelledAt: now,
      cancelReason: reason,
    },
    closeLines: true,
    now,
  });
  await deps.audit.append({
    workspaceId,
    action: 'stock_count.cancelled',
    category: 'workspace',
    actorId: ctx.userId,
    correlationId: session.id,
    payload: { reason },
  });
  return updated;
}

export async function setStockCountFreeze(
  deps: StockCountTransitionDeps,
  input: Omit<StockCountTransitionInput, 'note'> & { freeze: boolean }
): Promise<StockCountSessionRecord> {
  const { ctx, workspaceId, now } = input;
  const session = await loadScopedSession(
    deps.store,
    ctx,
    workspaceId,
    input.sessionId
  );
  assertManagerOrAdmin(ctx);
  if (session.status !== 'counting') {
    throw stockCountValidation('Freeze hanya bisa diubah saat sesi hitung.');
  }
  const freeze = input.freeze === true;
  const updated = await deps.store.updateSession({
    workspaceId,
    sessionId: session.id,
    expectedVersion: input.expectedVersion,
    expectedStatus: 'counting',
    changes: { freezeOutboundTransfers: freeze },
    now,
  });
  await deps.audit.append({
    workspaceId,
    action: 'stock_count.freeze_changed',
    category: 'workspace',
    actorId: ctx.userId,
    correlationId: session.id,
    payload: { sessionId: session.id, freeze },
  });
  return updated;
}
