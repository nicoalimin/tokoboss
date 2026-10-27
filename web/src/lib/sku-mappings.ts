/**
 * SKU mapping wiring for Route Handlers (UTA-40 / US03, RFC 05 task 25a).
 *
 * - Deps mirror `@/lib/stock-count`: Postgres (`DATABASE_URL` set)
 *   through `DrizzleSkuMappingRepository` (one instance = deps.reads +
 *   deps.tx), otherwise a process-local `InMemorySkuMappingStore`
 *   (local-dev/fixture mode). Audit is the shared tenancy sink.
 * - Membership / editor gates and JSON error bodies live in
 *   `sku-mapping-routes.ts` (25b); record → wire views in
 *   `sku-mapping-views.ts` (25c).
 */
import {
  DrizzleSkuMappingRepository,
  createDb,
  type DbHandle,
} from '@tokoboss/database';
import {
  InMemorySkuMappingStore,
  SKU_MAPPING_ERROR_HTTP_STATUS,
  createSkuMappingState,
  type InMemorySkuMappingState,
  type SkuMappingDeps,
  type SkuMappingErrorCode,
} from '@tokoboss/application';
import { getAuthAudit, storageKind } from '@/lib/auth';

let dbHandle: DbHandle | null = null;
let memory: InMemorySkuMappingStore | null = null;

function getDbHandle(): DbHandle {
  if (!dbHandle) dbHandle = createDb(process.env['DATABASE_URL']);
  return dbHandle;
}

/** Memory-mode store (also the seed seam for web route tests). */
export function getMemorySkuMappingStore(): InMemorySkuMappingStore {
  return (memory ??= new InMemorySkuMappingStore());
}

/** Deps for every SKU mapping use case: reads, tx runner and audit. */
export function getSkuMappingDeps(): SkuMappingDeps {
  const repo =
    storageKind() === 'postgres'
      ? new DrizzleSkuMappingRepository(getDbHandle())
      : getMemorySkuMappingStore();
  return { reads: repo, tx: repo, audit: getAuthAudit() };
}

/**
 * Reset (optionally seed) process-local SKU mapping state. Test seam
 * for `web/src/__tests__`. Refuses production.
 */
export function __resetSkuMappingsForTests(
  seed: Partial<InMemorySkuMappingState> = {}
): void {
  if (
    process.env['APP_ENV'] === 'production' ||
    process.env['VERCEL_ENV'] === 'production'
  ) {
    throw new Error('Refusing fixture reset in production');
  }
  memory = new InMemorySkuMappingStore(createSkuMappingState(seed));
}

/**
 * Map application-layer SKU mapping errors to HTTP status codes
 * (SKU_MAPPING_ERROR_HTTP_STATUS, task 9a). Use-case messages are
 * client-safe; unknown failures collapse to a generic 500.
 */
export function skuMappingErrorStatus(err: unknown): {
  status: number;
  errorCode: string;
} {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  if (
    !Object.prototype.hasOwnProperty.call(SKU_MAPPING_ERROR_HTTP_STATUS, code)
  ) {
    return { status: 500, errorCode: 'SKU_MAPPING_FAILED' };
  }
  const status = SKU_MAPPING_ERROR_HTTP_STATUS[code as SkuMappingErrorCode];
  return { status, errorCode: code };
}
