import type { InventorySyncDeps } from '@tokoboss/application';
import { DrizzleInventorySyncReads } from './drizzle-inventory-sync-reads';
import type { DbOrTx } from './drizzle-inventory-sync-scope';
import { DrizzleInventorySyncWrites } from './drizzle-inventory-sync-writes';

/**
 * DrizzleInventorySyncRepository (UTA-37 / US04, RFC 06 task 31): the
 * Postgres facade for the reads + writes halves of InventorySyncDeps.
 * Mirrors InMemoryInventorySyncStore (26c): `reads` is
 * DrizzleInventorySyncReads (29c) and `writes` DrizzleInventorySyncWrites
 * (30c), both on the same handle. withTransaction rebinds both to one tx
 * so a commit + event + provider_stock write land together. Exported from
 * the repositories barrel in row 32; PGlite coverage in row 33.
 */
export class DrizzleInventorySyncRepository implements Pick<
  InventorySyncDeps,
  'reads' | 'writes'
> {
  readonly reads: DrizzleInventorySyncReads;
  readonly writes: DrizzleInventorySyncWrites;

  constructor(db: DbOrTx) {
    this.reads = new DrizzleInventorySyncReads(db);
    this.writes = new DrizzleInventorySyncWrites(db);
  }

  withTransaction(tx: DbOrTx): DrizzleInventorySyncRepository {
    return new DrizzleInventorySyncRepository(tx);
  }
}
