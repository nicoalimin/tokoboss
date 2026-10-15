import type { CatalogStore } from '../catalog/catalog-ports';
import type { TenancyAuditSink } from '../tenancy/tenancy-ports';
import type { WorkspaceContext } from '../tenancy/tenancy-types';
import {
  assertManagerOrAdmin,
  assertSameWorkspace,
} from '../tenancy/workspace-context';
import { stockCountNotFound, stockCountValidation } from './stock-count-errors';
import type { StockCountStore } from './stock-count-ports';
import { MAX_SESSION_LINES } from './stock-count-rules';
import {
  STOCK_COUNT_SCOPE_TYPES,
  type StockCountScopeType,
  type StockCountSessionRecord,
} from './stock-count-types';

/**
 * Start a stock-opname session (US12 / RFC 03 task 9). Any role within
 * warehouse scope (unknown/out-of-scope warehouse = STOCK_COUNT_NOT_FOUND);
 * active warehouse; 1..MAX_SESSION_LINES eligible SKUs; freeze needs
 * Manager/Admin; store enforces overlap. Emits `stock_count.started`.
 */
export interface StartStockCountDeps {
  store: StockCountStore;
  catalog: Pick<CatalogStore, 'findWarehouseById'>;
  audit: Pick<TenancyAuditSink, 'append'>;
}

export async function startStockCount(
  deps: StartStockCountDeps,
  input: {
    ctx: WorkspaceContext;
    workspaceId: string;
    warehouseId: string;
    name: string;
    scopeType: StockCountScopeType;
    variantIds?: string[] | null;
    freezeOutboundTransfers?: boolean;
    now: Date;
  }
): Promise<{ session: StockCountSessionRecord; lineCount: number }> {
  const { ctx, workspaceId } = input;
  assertSameWorkspace(ctx, workspaceId);
  const warehouse = await deps.catalog.findWarehouseById(
    workspaceId,
    input.warehouseId.trim()
  );
  const inScope =
    ctx.role === 'admin' ||
    ctx.warehouseScope === null ||
    ctx.warehouseScope === warehouse?.id;
  if (!warehouse || !inScope) throw stockCountNotFound();
  if (warehouse.status !== 'active') {
    throw stockCountValidation('Gudang tidak aktif.');
  }
  const name = input.name.trim();
  if (name.length === 0 || name.length > 120) {
    throw stockCountValidation('Nama sesi wajib diisi (maks. 120 karakter).');
  }
  if (!STOCK_COUNT_SCOPE_TYPES.includes(input.scopeType)) {
    throw stockCountValidation('Cakupan tidak valid.');
  }
  let variantIds: string[] | null = null;
  if (input.scopeType === 'skus') {
    variantIds = [...new Set(input.variantIds ?? [])];
    if (variantIds.length === 0) {
      throw stockCountValidation('Pilih minimal satu SKU.');
    }
  }
  const freeze = input.freezeOutboundTransfers === true;
  if (freeze) assertManagerOrAdmin(ctx);
  const eligible = await deps.store.countEligibleVariants({
    workspaceId,
    warehouseId: warehouse.id,
    variantIds,
  });
  if (eligible === 0)
    throw stockCountValidation('Tidak ada SKU untuk dihitung');
  if (eligible > MAX_SESSION_LINES) {
    throw stockCountValidation(
      `Maksimal ${MAX_SESSION_LINES} SKU per sesi. Persempit cakupan.`
    );
  }
  const result = await deps.store.createSession({
    workspaceId,
    warehouseId: warehouse.id,
    name,
    scopeType: input.scopeType,
    variantIds,
    freezeOutboundTransfers: freeze,
    actorId: ctx.userId,
    now: input.now,
  });
  await deps.audit.append({
    workspaceId,
    action: 'stock_count.started',
    category: 'workspace',
    actorId: ctx.userId,
    correlationId: result.session.id,
    payload: {
      sessionId: result.session.id,
      warehouseId: warehouse.id,
      lineCount: result.lineCount,
      scopeType: input.scopeType,
      freeze,
    },
  });
  return result;
}
