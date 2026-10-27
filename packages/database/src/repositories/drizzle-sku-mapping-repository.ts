import type {
  SkuMappingStore,
  SkuMappingTxRunner,
} from '@tokoboss/application';
import type { DatabaseHandle, Transaction } from '../db';
import { DrizzleSkuMappingReadStore } from './drizzle-sku-mapping-reads';
import { DrizzleSkuMappingWriteStore } from './drizzle-sku-mapping-writes';

/**
 * DrizzleSkuMappingRepository (UTA-40 / US03, RFC 05 task 23): the
 * Postgres facade for SkuMappingDeps. Mirrors InMemorySkuMappingStore
 * (17e): one instance serves as deps.reads (DrizzleSkuMappingReadStore,
 * 22f, on the outer handle) and deps.tx (SkuMappingTxRunner). Each run()
 * opens one transaction and hands the callback a fresh
 * DrizzleSkuMappingWriteStore (21c) bound to it, so mapping, listing
 * state and history commit or roll back together (AC5). Exported from
 * the repositories barrel in row 24; PGlite coverage in row 48.
 */

/** Structural slice of DbHandle (see createDb); PGlite tests pass their own. */
export interface SkuMappingDbHandle {
  db: Transaction | DatabaseHandle;
  withTransaction: <T>(fn: (tx: Transaction) => Promise<T>) => Promise<T>;
}

export class DrizzleSkuMappingRepository
  extends DrizzleSkuMappingReadStore
  implements SkuMappingTxRunner
{
  constructor(private readonly handle: SkuMappingDbHandle) {
    super(handle.db);
  }

  /** Commits on resolve, rolls back on throw (DbHandle.withTransaction). */
  run<T>(fn: (store: SkuMappingStore) => Promise<T>): Promise<T> {
    return this.handle.withTransaction((tx) =>
      fn(new DrizzleSkuMappingWriteStore(tx))
    );
  }
}

/** Tx runner only, like drizzleJobTxRunner, for callers wiring deps.tx alone. */
export function drizzleSkuMappingTxRunner(
  handle: Pick<SkuMappingDbHandle, 'withTransaction'>
): SkuMappingTxRunner {
  return {
    run: <T>(fn: (store: SkuMappingStore) => Promise<T>): Promise<T> =>
      handle.withTransaction((tx) => fn(new DrizzleSkuMappingWriteStore(tx))),
  };
}
