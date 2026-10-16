/**
 * Stock-opname infrastructure wiring for Route Handlers
 * (US12 / RFC 03 task 30a).
 *
 * - Stores mirror `@/lib/catalog` / `@/lib/imports`: Postgres
 *   (`DATABASE_URL` set) through `DrizzleStockCountStore`, otherwise a
 *   process-local `InMemoryStockCountStore` (local-dev/fixture mode;
 *   responses include `storage: "memory"`).
 * - Authorization for opname routes uses `@/lib/workspace-access`
 *   (RFC 02 neutral 404); this module only wires the store and maps
 *   application errors to HTTP. View mappers are task 30b.
 * - Memory mode shares the catalog singleton so snapshot / adjustLevel
 *   see the same in-memory levels as other handlers.
 */
import {
  DrizzleStockCountStore,
  createDb,
  type DbHandle,
} from '@tokoboss/database';
import {
  InMemoryStockCountStore,
  type StockCountStore,
} from '@tokoboss/application';
import { storageKind } from '@/lib/auth';
import { getCatalogStore } from '@/lib/catalog';

export { storageKind } from '@/lib/auth';

let dbHandle: DbHandle | null = null;
let memoryStockCount: InMemoryStockCountStore | null = null;

function getDbHandle(): DbHandle {
  if (!dbHandle) dbHandle = createDb(process.env['DATABASE_URL']);
  return dbHandle;
}

function getMemoryStockCount(): InMemoryStockCountStore {
  if (!memoryStockCount) {
    memoryStockCount = new InMemoryStockCountStore(getCatalogStore());
  }
  return memoryStockCount;
}

export function getStockCountStore(): StockCountStore {
  if (storageKind() === 'postgres') {
    return new DrizzleStockCountStore(getDbHandle().db);
  }
  return getMemoryStockCount();
}

/**
 * Reset process-local stock-count state. Test seam for
 * `web/src/__tests__`; call alongside `__resetCatalogForTests`.
 * Refuses production.
 */
export function __resetStockCountForTests(): void {
  if (
    process.env['APP_ENV'] === 'production' ||
    process.env['VERCEL_ENV'] === 'production'
  ) {
    throw new Error('Refusing fixture reset in production');
  }
  memoryStockCount = new InMemoryStockCountStore(getCatalogStore());
}

/**
 * Map application-layer stock-count errors to HTTP status codes.
 * Messages from the use-cases are client-safe (opaque ids only); unknown
 * failures collapse to a generic 500. TENANCY_FORBIDDEN is thrown by
 * shared tenancy helpers used inside the use-cases.
 */
export function stockCountErrorStatus(err: unknown): {
  status: number;
  errorCode: string;
} {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  switch (code) {
    case 'STOCK_COUNT_VALIDATION':
      return { status: 400, errorCode: 'STOCK_COUNT_VALIDATION' };
    case 'TENANCY_FORBIDDEN':
      return { status: 403, errorCode: 'TENANCY_FORBIDDEN' };
    case 'STOCK_COUNT_NOT_FOUND':
      return { status: 404, errorCode: 'STOCK_COUNT_NOT_FOUND' };
    case 'STOCK_COUNT_OVERLAP':
    case 'STOCK_COUNT_VERSION_CONFLICT':
    case 'STOCK_COUNT_FREEZE':
    case 'STOCK_COUNT_ACTIVE':
      return { status: 409, errorCode: code };
    default:
      return { status: 500, errorCode: 'STOCK_COUNT_FAILED' };
  }
}
