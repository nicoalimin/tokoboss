import { stockCountNotFound } from './stock-count-errors';
import type {
  RecordStockCountEntryInput,
  RecordStockCountEntryResult,
} from './stock-count-port-inputs';
import { mergeEntry } from './stock-count-rules';
import type { StockCountEntryRecord } from './stock-count-types';
import {
  copyRecord,
  nextStockCountId,
  type StockCountMemory,
} from './in-memory-stock-count-state';

/**
 * In-memory recordEntry (US12 / RFC 03 task 8c-ii). Add/replace merge,
 * system qty at count refreshed from the live level (D1), and dedupe by
 * clientEntryId (same id returns the stored result, deduplicated: true).
 * Payload-mismatch 409 and the counting-status guard are use-case rules.
 */
export async function recordEntry(
  mem: StockCountMemory,
  input: RecordStockCountEntryInput
): Promise<RecordStockCountEntryResult> {
  const key = `${input.workspaceId}:${input.clientEntryId}`;
  const seenId = mem.entryKeys.get(key);
  if (seenId) {
    const seen = mem.entries.get(seenId);
    const seenLine = seen ? mem.lines.get(seen.lineId) : undefined;
    if (seen && seenLine) {
      return {
        line: copyRecord(seenLine),
        entry: copyRecord(seen),
        deduplicated: true,
      };
    }
  }
  const line = mem.lines.get(input.lineId);
  if (!line || line.workspaceId !== input.workspaceId) {
    throw stockCountNotFound();
  }
  const level = await mem.catalog.getLevel(
    input.workspaceId,
    line.variantId,
    line.warehouseId
  );
  line.countedQty = mergeEntry(line.countedQty, input.qty, input.mode);
  line.systemQtyAtCount = level?.qty ?? 0;
  line.countedAt = input.now;
  line.countedBy = input.actorId;
  line.entryCount += 1;
  line.version += 1;
  line.updatedAt = input.now;
  const entry: StockCountEntryRecord = {
    id: nextStockCountId(mem, 'sce'),
    workspaceId: input.workspaceId,
    sessionId: line.sessionId,
    lineId: line.id,
    qty: input.qty,
    mode: input.mode,
    clientEntryId: input.clientEntryId,
    deviceLabel: input.deviceLabel,
    actorId: input.actorId,
    createdAt: input.now,
  };
  mem.entries.set(entry.id, entry);
  mem.entryKeys.set(key, entry.id);
  const session = mem.sessions.get(line.sessionId);
  if (session) session.lastActivityAt = input.now;
  return {
    line: copyRecord(line),
    entry: copyRecord(entry),
    deduplicated: false,
  };
}
