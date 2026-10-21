import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { MarketplaceProvider } from '@tokoboss/domain';
import type { DatabaseHandle, Transaction } from '../db';
import { catalogChannelMappings } from '../schema/index';

type DbOrTx = Transaction | DatabaseHandle;
type StoreRef = {
  workspaceId: string;
  provider: MarketplaceProvider;
  providerStoreId: string;
};

/**
 * Postgres-backed mapping-archive half of `ListingStore` (UTA-39 / US20,
 * RFC 04 task 74). Hapus koneksi archives and reconnect unarchives this
 * workspace's `catalog_channel_mappings` for one store, keyed by
 * (workspace, channel = provider, shop_ext_id = provider store id).
 * Only rows whose state actually changes are touched and counted,
 * matching `InMemoryListingStore.setMappingsArchived`.
 */
export class DrizzleMappingArchiveStore {
  constructor(private readonly db: DbOrTx) {}

  withTransaction(tx: DbOrTx): DrizzleMappingArchiveStore {
    return new DrizzleMappingArchiveStore(tx);
  }

  async setMappingsArchived(
    key: StoreRef,
    archivedAt: Date | null
  ): Promise<number> {
    const m = catalogChannelMappings;
    const rows = await this.db
      .update(m)
      .set({ archivedAt, updatedAt: new Date() })
      .where(
        and(
          eq(m.workspaceId, key.workspaceId),
          eq(m.channel, key.provider),
          eq(m.shopExtId, key.providerStoreId),
          archivedAt === null ? isNotNull(m.archivedAt) : isNull(m.archivedAt)
        )
      )
      .returning({ id: m.id });
    return rows.length;
  }
}
