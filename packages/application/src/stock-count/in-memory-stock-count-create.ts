import type { CatalogVariantRecord } from '../catalog/catalog-types';
import { stockCountOverlap } from './stock-count-errors';
import type { CreateStockCountSessionInput } from './stock-count-port-inputs';
import type { StockCountSessionRecord } from './stock-count-types';
import {
  newLineRecord,
  newSessionRecord,
} from './in-memory-stock-count-records';
import {
  copyRecord,
  findOpenLine,
  nextSessionCode,
  nextStockCountId,
  type StockCountMemory,
} from './in-memory-stock-count-state';

/**
 * In-memory session creation (US12 / RFC 03 task 8b-ii): eligible-variant
 * scope and `createSession` (session + snapshot lines in one step).
 */

/** Active, non-bundle variants in scope (null variantIds = all). */
export async function eligibleVariants(
  mem: StockCountMemory,
  workspaceId: string,
  variantIds: string[] | null
): Promise<CatalogVariantRecord[]> {
  const wanted = variantIds === null ? null : new Set(variantIds);
  const out: CatalogVariantRecord[] = [];
  for (const v of await mem.catalog.listVariantsByWorkspace(workspaceId)) {
    if (v.status !== 'active' || (wanted && !wanted.has(v.id))) continue;
    if (await mem.catalog.isBundleVariant(workspaceId, v.id)) continue;
    out.push(v);
  }
  return out;
}

export async function countEligibleVariants(
  mem: StockCountMemory,
  input: {
    workspaceId: string;
    warehouseId: string;
    variantIds: string[] | null;
  }
): Promise<number> {
  const variants = await eligibleVariants(
    mem,
    input.workspaceId,
    input.variantIds
  );
  return variants.length;
}

/** Throws STOCK_COUNT_OVERLAP before writing anything. */
export async function createSession(
  mem: StockCountMemory,
  input: CreateStockCountSessionInput
): Promise<{ session: StockCountSessionRecord; lineCount: number }> {
  const { workspaceId, warehouseId, now } = input;
  const variants = await eligibleVariants(mem, workspaceId, input.variantIds);
  for (const v of variants) {
    const open = findOpenLine(mem, workspaceId, warehouseId, v.id);
    if (open) throw stockCountOverlap(open.sessionId);
  }
  const session = newSessionRecord(
    input,
    nextStockCountId(mem, 'scs'),
    nextSessionCode(mem, workspaceId, now)
  );
  mem.sessions.set(session.id, session);
  for (const v of variants) {
    const level = await mem.catalog.getLevel(workspaceId, v.id, warehouseId);
    const id = nextStockCountId(mem, 'scl');
    mem.lines.set(id, newLineRecord(session, id, v.id, level?.qty ?? 0));
  }
  return { session: copyRecord(session), lineCount: variants.length };
}
