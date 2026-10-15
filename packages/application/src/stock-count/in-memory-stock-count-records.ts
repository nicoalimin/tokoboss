import type { CreateStockCountSessionInput } from './stock-count-port-inputs';
import type {
  StockCountLineRecord,
  StockCountSessionRecord,
} from './stock-count-types';

/**
 * Fresh record builders for the in-memory StockCountStore
 * (US12 / RFC 03 task 8b-i). Pure: ids/code are allocated by the caller.
 */

/** A new `counting` session at version 1, snapshot taken at `now`. */
export function newSessionRecord(
  input: CreateStockCountSessionInput,
  id: string,
  code: string
): StockCountSessionRecord {
  const { now } = input;
  return {
    id,
    workspaceId: input.workspaceId,
    warehouseId: input.warehouseId,
    code,
    name: input.name,
    scopeType: input.scopeType,
    status: 'counting',
    freezeOutboundTransfers: input.freezeOutboundTransfers,
    snapshotAt: now,
    createdBy: input.actorId,
    submittedBy: null,
    submittedAt: null,
    submitNote: null,
    returnedBy: null,
    returnedAt: null,
    returnNote: null,
    postedBy: null,
    postedAt: null,
    cancelledBy: null,
    cancelledAt: null,
    cancelReason: null,
    selfApproved: false,
    lastActivityAt: now,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/** A new open, uncounted snapshot line at version 1. */
export function newLineRecord(
  session: StockCountSessionRecord,
  id: string,
  variantId: string,
  snapshotQty: number
): StockCountLineRecord {
  return {
    id,
    workspaceId: session.workspaceId,
    sessionId: session.id,
    warehouseId: session.warehouseId,
    variantId,
    snapshotQty,
    countedQty: null,
    systemQtyAtCount: null,
    countedAt: null,
    countedBy: null,
    entryCount: 0,
    varianceReasonCode: null,
    varianceNote: null,
    flagVerified: false,
    ledgerEntryId: null,
    isOpen: true,
    version: 1,
    createdAt: session.createdAt,
    updatedAt: session.createdAt,
  };
}
