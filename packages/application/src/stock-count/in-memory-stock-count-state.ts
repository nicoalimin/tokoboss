import type { CatalogStore } from '../catalog/catalog-ports';
import { stockCountVersionConflict } from './stock-count-errors';
import type { StockCountPostResult } from './stock-count-port-inputs';
import type {
  StockCountEntryRecord,
  StockCountLineRecord,
  StockCountSessionRecord,
} from './stock-count-types';

/**
 * Shared state + helpers for the in-memory StockCountStore
 * (US12 / RFC 03 task 8a). Session ops, line/entry ops and the class
 * itself live in sibling in-memory-stock-count-*.ts files (tasks 8b-8d).
 */

/** Catalog reads/writes the in-memory stock-count store relies on. */
export type StockCountCatalog = Pick<
  CatalogStore,
  'listVariantsByWorkspace' | 'isBundleVariant' | 'getLevel' | 'adjustLevel'
>;

export interface StockCountMemory {
  catalog: StockCountCatalog;
  sessions: Map<string, StockCountSessionRecord>;
  lines: Map<string, StockCountLineRecord>;
  entries: Map<string, StockCountEntryRecord>;
  /** `${workspaceId}:${clientEntryId}` -> entry id. */
  entryKeys: Map<string, string>;
  /** `${workspaceId}:${idempotencyKey}` -> stored post result. */
  postKeys: Map<string, StockCountPostResult>;
  /** `${workspaceId}:${year}` -> last session number used in `code`. */
  codeSeq: Map<string, number>;
  seq: number;
}

export function newStockCountMemory(
  catalog: StockCountCatalog
): StockCountMemory {
  return {
    catalog,
    sessions: new Map(),
    lines: new Map(),
    entries: new Map(),
    entryKeys: new Map(),
    postKeys: new Map(),
    codeSeq: new Map(),
    seq: 0,
  };
}

/** Deterministic ids for tests (`scs_1`, `scl_2`, ...). */
export function nextStockCountId(mem: StockCountMemory, prefix: string) {
  mem.seq += 1;
  return `${prefix}_${mem.seq}`;
}

/** `OPN-YYYY-NNNN`, numbered per workspace and UTC year. */
export function nextSessionCode(
  mem: StockCountMemory,
  workspaceId: string,
  now: Date
): string {
  const year = now.getUTCFullYear();
  const key = `${workspaceId}:${year}`;
  const n = (mem.codeSeq.get(key) ?? 0) + 1;
  mem.codeSeq.set(key, n);
  return `OPN-${year}-${String(n).padStart(4, '0')}`;
}

/** Shallow copy with fresh Date instances, so callers never alias state. */
export function copyRecord<T extends object>(record: T): T {
  const out = { ...record } as Record<string, unknown>;
  for (const [k, v] of Object.entries(out)) {
    if (v instanceof Date) out[k] = new Date(v.getTime());
  }
  return out as T;
}

/** Optimistic concurrency guard shared by session and line writes. */
export function assertVersion(current: { version: number }, expected: number) {
  if (current.version !== expected) {
    throw stockCountVersionConflict(current.version);
  }
}

/** The open line for warehouse+variant in any session, if one exists. */
export function findOpenLine(
  mem: StockCountMemory,
  workspaceId: string,
  warehouseId: string,
  variantId: string
): StockCountLineRecord | undefined {
  for (const line of mem.lines.values()) {
    if (!line.isOpen || line.workspaceId !== workspaceId) continue;
    if (line.warehouseId === warehouseId && line.variantId === variantId) {
      return line;
    }
  }
  return undefined;
}
