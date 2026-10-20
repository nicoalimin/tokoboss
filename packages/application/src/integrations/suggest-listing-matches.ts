import type { MarketplaceListingRow } from '@tokoboss/domain';
import type { ListingMappingState } from './integration-types';

/** A catalog variant as the matcher sees it (no stock, no prices). */
export interface MatchableVariant {
  id: string;
  skuCode: string | null;
  barcode: string | null;
}

export interface ListingMatch {
  platformSkuId: string;
  mappingState: ListingMappingState;
  suggestedVariantIds: string[];
}

export interface SuggestListingMatchesInput {
  listings: readonly Pick<
    MarketplaceListingRow,
    'platformSkuId' | 'storeSkuText' | 'barcodeHint'
  >[];
  variants: readonly MatchableVariant[];
  /** platformSkuIds that already have a non-archived channel mapping. */
  mappedPlatformSkuIds: ReadonlySet<string>;
}

const norm = (value: string | null): string =>
  (value ?? '').trim().toUpperCase();

function indexBy(
  variants: readonly MatchableVariant[],
  key: (v: MatchableVariant) => string | null
): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const variant of variants) {
    const k = norm(key(variant));
    if (!k) continue;
    index.set(k, [...(index.get(k) ?? []), variant.id]);
  }
  return index;
}

/**
 * Pure listing → variant matcher (US20 / RFC 04 task 31). Suggests only,
 * never writes mappings. Exact normalised Store SKU text = sku_code, or
 * exact barcode hint = barcode. One candidate → suggested, several →
 * ambiguous, none → unmapped; an existing mapping → mapped. Blank or
 * duplicated (within this batch) Store SKU text gives no SKU suggestion.
 */
export function suggestListingMatches(
  input: SuggestListingMatchesInput
): ListingMatch[] {
  const bySku = indexBy(input.variants, (v) => v.skuCode);
  const byBarcode = indexBy(input.variants, (v) => v.barcode);
  const skuCounts = new Map<string, number>();
  for (const row of input.listings) {
    const k = norm(row.storeSkuText);
    if (k) skuCounts.set(k, (skuCounts.get(k) ?? 0) + 1);
  }
  return input.listings.map((row) => {
    const { platformSkuId } = row;
    if (input.mappedPlatformSkuIds.has(platformSkuId)) {
      return { platformSkuId, mappingState: 'mapped', suggestedVariantIds: [] };
    }
    const sku = norm(row.storeSkuText);
    const barcode = norm(row.barcodeHint);
    const ids = new Set<string>([
      ...(sku && skuCounts.get(sku) === 1 ? (bySku.get(sku) ?? []) : []),
      ...(barcode ? (byBarcode.get(barcode) ?? []) : []),
    ]);
    const suggestedVariantIds = [...ids].sort();
    const mappingState: ListingMappingState =
      suggestedVariantIds.length === 0
        ? 'unmapped'
        : suggestedVariantIds.length === 1
          ? 'suggested'
          : 'ambiguous';
    return { platformSkuId, mappingState, suggestedVariantIds };
  });
}
