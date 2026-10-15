import { stockCountNotFound, stockCountValidation } from './stock-count-errors';
import type {
  ListStockCountSessionsInput,
  UpdateStockCountSessionInput,
} from './stock-count-port-inputs';
import type { StockCountSessionRecord } from './stock-count-types';
import {
  assertVersion,
  copyRecord,
  type StockCountMemory,
} from './in-memory-stock-count-state';

/**
 * In-memory session reads/updates (US12 / RFC 03 task 8b-iii):
 * findSession, listSessions, findActiveSession, updateSession.
 */

export async function findSession(
  mem: StockCountMemory,
  workspaceId: string,
  sessionId: string
): Promise<StockCountSessionRecord | null> {
  const session = mem.sessions.get(sessionId);
  if (!session || session.workspaceId !== workspaceId) return null;
  return copyRecord(session);
}

export async function listSessions(
  mem: StockCountMemory,
  input: ListStockCountSessionsInput
): Promise<StockCountSessionRecord[]> {
  const warehouses =
    input.warehouseIds === null ? null : new Set(input.warehouseIds);
  const statuses = input.statuses ? new Set<string>(input.statuses) : null;
  const out: StockCountSessionRecord[] = [];
  for (const session of mem.sessions.values()) {
    if (session.workspaceId !== input.workspaceId) continue;
    if (warehouses && !warehouses.has(session.warehouseId)) continue;
    if (statuses && !statuses.has(session.status)) continue;
    out.push(copyRecord(session));
  }
  return out;
}

/** First counting/submitted session in the warehouse (optional freeze filter). */
export async function findActiveSession(
  mem: StockCountMemory,
  workspaceId: string,
  warehouseId: string,
  options?: { freezingOnly?: boolean }
): Promise<StockCountSessionRecord | null> {
  for (const session of mem.sessions.values()) {
    if (session.workspaceId !== workspaceId) continue;
    if (session.warehouseId !== warehouseId) continue;
    if (session.status !== 'counting' && session.status !== 'submitted') {
      continue;
    }
    if (options?.freezingOnly && !session.freezeOutboundTransfers) continue;
    return copyRecord(session);
  }
  return null;
}

/** Submit / return / cancel / freeze; guarded on version + status. */
export async function updateSession(
  mem: StockCountMemory,
  input: UpdateStockCountSessionInput
): Promise<StockCountSessionRecord> {
  const session = mem.sessions.get(input.sessionId);
  if (!session || session.workspaceId !== input.workspaceId) {
    throw stockCountNotFound();
  }
  assertVersion(session, input.expectedVersion);
  if (session.status !== input.expectedStatus) {
    throw stockCountValidation('Session is not in the expected status.');
  }
  Object.assign(session, input.changes);
  session.version += 1;
  session.updatedAt = input.now;
  session.lastActivityAt = input.now;
  if (input.clearReview || input.closeLines) {
    for (const line of mem.lines.values()) {
      if (line.sessionId !== session.id) continue;
      if (input.clearReview) {
        line.varianceReasonCode = null;
        line.varianceNote = null;
        line.flagVerified = false;
      }
      if (input.closeLines) line.isOpen = false;
      line.version += 1;
      line.updatedAt = input.now;
    }
  }
  return copyRecord(session);
}
