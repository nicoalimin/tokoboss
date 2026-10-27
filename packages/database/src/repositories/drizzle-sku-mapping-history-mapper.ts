import {
  SKU_MAPPING_ACTOR_FALLBACK,
  type SkuMappingHistoryEntry,
} from '@tokoboss/application';
import type { CatalogChannelMappingEventRow } from '../schema/index';
import { toSkuMappingEventRecord } from './drizzle-sku-mapping-mappers';

/**
 * Joined history row → SkuMappingHistoryEntry (UTA-40 / US03,
 * RFC 05 task 20b). Used by the Drizzle SKU mapping read store (row 22).
 */

/** SKU codes, store name and user_profiles.display_name from the joins. */
export interface SkuMappingHistoryJoin {
  skuCode: string | null;
  previousSkuCode: string | null;
  storeDisplayName: string | null;
  actorDisplayName: string | null;
}

/** Never exposes an email: a blank or missing name → "Anggota tim". */
export function toSkuMappingHistoryEntry(
  row: CatalogChannelMappingEventRow,
  joined: SkuMappingHistoryJoin
): SkuMappingHistoryEntry {
  return {
    ...toSkuMappingEventRecord(row),
    skuCode: joined.skuCode,
    previousSkuCode: joined.previousSkuCode,
    storeDisplayName: joined.storeDisplayName,
    actorDisplayName:
      joined.actorDisplayName?.trim() || SKU_MAPPING_ACTOR_FALLBACK,
  };
}
