import type { WorkspaceContext } from '../tenancy/tenancy-types';
import { assertSameWorkspace } from '../tenancy/workspace-context';
import {
  stockCountNotFound,
  stockCountValidation,
  stockCountVersionConflict,
} from './stock-count-errors';
import type { RecordStockCountEntryResult } from './stock-count-port-inputs';
import type { StockCountStore } from './stock-count-ports';
import { isValidEntryQty, type StockCountEntryMode } from './stock-count-rules';
import type { StockCountLineRecord } from './stock-count-types';

/**
 * Record one count entry on a session line (US12 / RFC 03 task 11).
 * Any role within warehouse scope (unknown/out-of-scope session =
 * STOCK_COUNT_NOT_FOUND); session must be `counting`; the line is found by
 * id or by scan (barcode, then sku_code, among the session's lines only).
 * The store applies add/replace, refreshes system qty at count (D1) and
 * dedupes by clientEntryId; the same id with a different payload is a 409.
 * Entries are not audited (stock_count_entries is the append-only record).
 */
export interface RecordCountEntryDeps {
  store: StockCountStore;
}

const ENTRY_MODES: readonly StockCountEntryMode[] = ['add', 'replace'];
const CLIENT_ENTRY_ID_PATTERN = /^[A-Za-z0-9\-_:.]{1,128}$/;

export async function recordCountEntry(
  deps: RecordCountEntryDeps,
  input: {
    ctx: WorkspaceContext;
    workspaceId: string;
    sessionId: string;
    lineId?: string | null;
    scanCode?: string | null;
    qty: number;
    mode: StockCountEntryMode;
    clientEntryId: string;
    deviceLabel?: string | null;
    now: Date;
  }
): Promise<RecordStockCountEntryResult> {
  const { ctx, workspaceId } = input;
  assertSameWorkspace(ctx, workspaceId);
  const session = await deps.store.findSession(workspaceId, input.sessionId);
  const inScope =
    ctx.role === 'admin' ||
    ctx.warehouseScope === null ||
    ctx.warehouseScope === session?.warehouseId;
  if (!session || !inScope) throw stockCountNotFound();
  if (session.status !== 'counting') {
    throw stockCountValidation('Sesi tidak dalam tahap hitung.');
  }
  if (!isValidEntryQty(input.qty)) {
    throw stockCountValidation('Jumlah harus bilangan bulat 0–1.000.000.');
  }
  if (!ENTRY_MODES.includes(input.mode)) {
    throw stockCountValidation('Mode hitung tidak valid.');
  }
  const clientEntryId = (input.clientEntryId ?? '').trim();
  if (!CLIENT_ENTRY_ID_PATTERN.test(clientEntryId)) {
    throw stockCountValidation('clientEntryId tidak valid.');
  }
  let line: StockCountLineRecord | null | undefined = null;
  const scanCode = (input.scanCode ?? '').trim();
  if (scanCode.length > 0) {
    line = await deps.store.findLineByScan(workspaceId, session.id, scanCode);
    if (!line) throw stockCountValidation('SKU tidak termasuk sesi ini');
  } else {
    const lineId = (input.lineId ?? '').trim();
    const lines = await deps.store.listLines(workspaceId, session.id);
    line = lines.find((l) => l.id === lineId);
    if (!line) throw stockCountNotFound();
  }
  if (!line.isOpen) throw stockCountValidation('Baris hitung sudah ditutup.');
  const deviceLabel = (input.deviceLabel ?? '').trim().slice(0, 80) || null;
  const result = await deps.store.recordEntry({
    workspaceId,
    lineId: line.id,
    qty: input.qty,
    mode: input.mode,
    clientEntryId,
    deviceLabel,
    actorId: ctx.userId,
    now: input.now,
  });
  if (result.deduplicated) {
    const e = result.entry;
    const samePayload =
      e.lineId === line.id && e.qty === input.qty && e.mode === input.mode;
    // Same clientEntryId, different payload → 409 (RFC 03 idempotency).
    if (!samePayload) throw stockCountVersionConflict(result.line.version);
  }
  return result;
}
