import type { IntegrationListingRowView } from '@tokoboss/contracts';
import type { IntegrationLang } from '@/lib/integration-copy';
import { getIntegrationListingReviewCopy } from '@/lib/integration-listing-review-copy';
import {
  listingDisplayTitle,
  listingMappingChip,
  listingStoreSku,
} from '@/lib/integration-listing-review-views';
import type { IntegrationBadgeTone } from '@/lib/integration-views';

/**
 * Staged listing cards (US20 / RFC 04 task 120c, CoS split of row 120):
 * one card per imported Store SKU row with the title and variant, Store SKU
 * text, provider stock (display only), SKU candidate count and the
 * mapping_state chip (label always shown, StatusBadge pill tones). Review
 * only: no mapping actions (Story 03). Presentational: no fetch, no state;
 * the list container adds filters, load more and empty / error states.
 */

const PILL =
  'inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold';

/** Middle dot separator, as in StoreRow. */
const SEP = ' \u00b7 ';

const TONE_CLASS: Record<IntegrationBadgeTone, string> = {
  neutral: 'bg-neutral-100 text-neutral-700',
  ok: 'bg-success-50 text-success-700',
  warn: 'bg-warning-50 text-warning-700',
  bad: 'bg-error-50 text-error-700',
};

export type ListingReviewCardRow = Pick<
  IntegrationListingRowView,
  | 'externalItemId'
  | 'platformSkuId'
  | 'title'
  | 'variantName'
  | 'storeSkuText'
  | 'providerStock'
  | 'mappingState'
  | 'suggestedVariantIds'
>;

export interface ListingReviewCardsProps {
  listings: readonly ListingReviewCardRow[];
  lang?: IntegrationLang;
}

export function ListingReviewCards({
  listings,
  lang = 'id',
}: Readonly<ListingReviewCardsProps>) {
  const copy = getIntegrationListingReviewCopy(lang);
  return (
    <ul data-testid="listing-review-cards" className="flex flex-col">
      {listings.map((row) => {
        const chip = listingMappingChip(row.mappingState, lang);
        const sku = row.storeSkuText?.trim()
          ? `${copy.storeSkuLabel} ${listingStoreSku(row, lang)}`
          : copy.noStoreSku;
        const candidates = row.suggestedVariantIds.length;
        return (
          <li
            key={`${row.externalItemId}:${row.platformSkuId}`}
            data-testid="listing-review-card"
            data-state={chip.state}
            className="flex flex-wrap items-center gap-3 border-t border-neutral-200 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-neutral-900">
                {listingDisplayTitle(row)}
              </p>
              <p className="text-xs text-neutral-600">
                {sku}
                {row.providerStock === null
                  ? null
                  : `${SEP}${copy.stock(row.providerStock)}`}
                {candidates > 0 ? `${SEP}${copy.candidates(candidates)}` : null}
              </p>
            </div>
            <span
              data-testid="listing-mapping-chip"
              data-tone={chip.tone}
              className={`${PILL} ${TONE_CLASS[chip.tone]}`}
            >
              {chip.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
