import { stockCountNotFound, stockCountValidation } from './stock-count-errors';
import type {
  PostStockCountSessionInput,
  StockCountPostResult,
} from './stock-count-port-inputs';
import { computeVariance, ledgerReasonFor } from './stock-count-rules';
import {
  assertVersion,
  copyRecord,
  type StockCountMemory,
} from './in-memory-stock-count-state';

/**
 * In-memory postSession (US12 / RFC 03 task 8d-i). Idempotent via
 * postKeys; applies ledger deltas through catalog.adjustLevel; closes
 * every line. Role/reason/flag checks stay in the use-case.
 */
export async function postSession(
  mem: StockCountMemory,
  input: PostStockCountSessionInput
): Promise<StockCountPostResult> {
  const key = `${input.workspaceId}:${input.idempotencyKey}`;
  const seen = mem.postKeys.get(key);
  if (seen) {
    return {
      session: copyRecord(seen.session),
      postedLines: seen.postedLines,
      deduplicated: true,
    };
  }
  const session = mem.sessions.get(input.sessionId);
  if (!session || session.workspaceId !== input.workspaceId) {
    throw stockCountNotFound();
  }
  assertVersion(session, input.expectedVersion);
  if (session.status !== 'submitted') {
    throw stockCountValidation('session must be submitted to post');
  }
  let postedLines = 0;
  for (const line of mem.lines.values()) {
    if (line.sessionId !== session.id) continue;
    if (line.workspaceId !== input.workspaceId) continue;
    const variance = computeVariance(line);
    const reason = ledgerReasonFor(variance);
    if (reason !== null && variance !== null) {
      const { entry } = await mem.catalog.adjustLevel({
        workspaceId: input.workspaceId,
        variantId: line.variantId,
        warehouseId: line.warehouseId,
        delta: variance,
        reason,
        actorId: input.actorId,
        correlationId: session.id,
        idempotencyKey: `opname:${session.id}:${line.id}`,
        allowNegative: true,
      });
      line.ledgerEntryId = entry.id;
      postedLines += 1;
    }
    line.isOpen = false;
    line.updatedAt = input.now;
  }
  session.status = 'posted';
  session.postedBy = input.actorId;
  session.postedAt = input.now;
  session.selfApproved = input.selfApproved;
  session.lastActivityAt = input.now;
  session.version += 1;
  session.updatedAt = input.now;
  const result: StockCountPostResult = {
    session: copyRecord(session),
    postedLines,
    deduplicated: false,
  };
  mem.postKeys.set(key, {
    session: copyRecord(session),
    postedLines,
    deduplicated: false,
  });
  return result;
}
