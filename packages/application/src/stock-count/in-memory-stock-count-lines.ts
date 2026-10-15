import { stockCountNotFound } from './stock-count-errors';
import type { UpdateStockCountLineReviewInput } from './stock-count-port-inputs';
import type {
  StockCountEntryRecord,
  StockCountLineRecord,
} from './stock-count-types';
import {
  assertVersion,
  copyRecord,
  type StockCountMemory,
} from './in-memory-stock-count-state';

/**
 * In-memory line reads + review update (US12 / RFC 03 task 8c-i):
 * listLines, findLineByScan, listEntries, updateLineReview.
 * recordEntry lives in in-memory-stock-count-entries.ts (task 8c-ii).
 */

function sessionLines(
  mem: StockCountMemory,
  workspaceId: string,
  sessionId: string
): StockCountLineRecord[] {
  const out: StockCountLineRecord[] = [];
  for (const line of mem.lines.values()) {
    if (line.workspaceId !== workspaceId) continue;
    if (line.sessionId === sessionId) out.push(line);
  }
  return out;
}

export async function listLines(
  mem: StockCountMemory,
  workspaceId: string,
  sessionId: string
): Promise<StockCountLineRecord[]> {
  return sessionLines(mem, workspaceId, sessionId).map(copyRecord);
}

/** Barcode first, then sku_code, among the session's lines only. */
export async function findLineByScan(
  mem: StockCountMemory,
  workspaceId: string,
  sessionId: string,
  code: string
): Promise<StockCountLineRecord | null> {
  const lines = sessionLines(mem, workspaceId, sessionId);
  if (lines.length === 0) return null;
  const variants = await mem.catalog.listVariantsByWorkspace(workspaceId);
  const byId = new Map(variants.map((v) => [v.id, v]));
  const byBarcode = lines.find((l) => byId.get(l.variantId)?.barcode === code);
  if (byBarcode) return copyRecord(byBarcode);
  const bySku = lines.find((l) => byId.get(l.variantId)?.skuCode === code);
  return bySku ? copyRecord(bySku) : null;
}

export async function listEntries(
  mem: StockCountMemory,
  workspaceId: string,
  lineId: string
): Promise<StockCountEntryRecord[]> {
  const out: StockCountEntryRecord[] = [];
  for (const entry of mem.entries.values()) {
    if (entry.workspaceId !== workspaceId) continue;
    if (entry.lineId === lineId) out.push(copyRecord(entry));
  }
  return out;
}

/** Reason code / note / flag tick; guarded on line version. */
export async function updateLineReview(
  mem: StockCountMemory,
  input: UpdateStockCountLineReviewInput
): Promise<StockCountLineRecord> {
  const line = mem.lines.get(input.lineId);
  if (!line || line.workspaceId !== input.workspaceId) {
    throw stockCountNotFound();
  }
  assertVersion(line, input.expectedVersion);
  line.varianceReasonCode = input.varianceReasonCode;
  line.varianceNote = input.varianceNote;
  line.flagVerified = input.flagVerified;
  line.version += 1;
  line.updatedAt = new Date();
  return copyRecord(line);
}
