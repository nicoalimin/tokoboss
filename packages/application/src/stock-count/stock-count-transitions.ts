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
 * Submit / return (US12 / RFC 03 task 13b). Submit: any role in scope,
 * needs >= 1 counted line (uncounted lines are excluded, never zero).
 * Return: Manager/Admin, note required; counts kept, review cleared.
 * Each records its actor and emits its audit event with actor_id.
 */
export async function submitStockCount(
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
  const from = requireTransition(session, 'submit');
  const note = cleanNote(input.note);
  const lines = await deps.store.listLines(workspaceId, session.id);
  const countedLines = lines.filter((l) => l.countedQty !== null).length;
  if (countedLines === 0) {
    throw stockCountValidation('Belum ada SKU yang dihitung.');
  }
  const updated = await deps.store.updateSession({
    workspaceId,
    sessionId: session.id,
    expectedVersion: input.expectedVersion,
    expectedStatus: from,
    changes: {
      status: 'submitted',
      submittedBy: ctx.userId,
      submittedAt: now,
      submitNote: note,
    },
    now,
  });
  await deps.audit.append({
    workspaceId,
    action: 'stock_count.submitted',
    category: 'workspace',
    actorId: ctx.userId,
    correlationId: session.id,
    payload: { countedLines, excludedLines: lines.length - countedLines },
  });
  return updated;
}

export async function returnStockCount(
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
  assertManagerOrAdmin(ctx);
  const from = requireTransition(session, 'return');
  const note = cleanNote(input.note);
  if (note === null) throw stockCountValidation('Catatan pengembalian wajib.');
  const updated = await deps.store.updateSession({
    workspaceId,
    sessionId: session.id,
    expectedVersion: input.expectedVersion,
    expectedStatus: from,
    changes: {
      status: 'counting',
      returnedBy: ctx.userId,
      returnedAt: now,
      returnNote: note,
    },
    clearReview: true,
    now,
  });
  await deps.audit.append({
    workspaceId,
    action: 'stock_count.returned',
    category: 'workspace',
    actorId: ctx.userId,
    correlationId: session.id,
    payload: { reason: note },
  });
  return updated;
}
