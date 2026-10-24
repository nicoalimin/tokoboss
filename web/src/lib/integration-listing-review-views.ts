/**
 * Pure view helpers for the import review list (US20 / RFC 04 task 120b,
 * CoS split of row 120): mapping_state chips and filter options, listing
 * text, order preview rupiah total and WIB time. No fetch, no React, no
 * secrets; the list component is 120c.
 */
import type {
  IntegrationListingMappingState,
  IntegrationListingRowView,
} from '@tokoboss/contracts';
import type { IntegrationLang } from './integration-copy';
import { getIntegrationListingReviewCopy } from './integration-listing-review-copy';
import type { IntegrationBadgeTone } from './integration-views';

type MappingState = IntegrationListingMappingState;

/** Review order: needs action first, then mapped, then ignored. */
export const LISTING_MAPPING_STATE_ORDER: readonly IntegrationListingMappingState[] =
  ['unmapped', 'ambiguous', 'suggested', 'mapped', 'ignored'];

/** Same pill tones as StatusBadge; the label is always shown too. */
const MAPPING_TONE: Record<MappingState, IntegrationBadgeTone> = {
  unmapped: 'warn',
  ambiguous: 'warn',
  suggested: 'neutral',
  mapped: 'ok',
  ignored: 'neutral',
};

export interface ListingMappingChip {
  state: MappingState;
  label: string;
  tone: IntegrationBadgeTone;
}

export function listingMappingChip(
  state: MappingState,
  lang: IntegrationLang = 'id'
): ListingMappingChip {
  const label = getIntegrationListingReviewCopy(lang).mappingState[state];
  return { state, label, tone: MAPPING_TONE[state] };
}

export interface ListingFilterOption {
  value: MappingState | null;
  label: string;
}

/** Semua (value null = no `mapping_state` query), then review order. */
export function listingFilterOptions(
  lang: IntegrationLang = 'id'
): ListingFilterOption[] {
  const copy = getIntegrationListingReviewCopy(lang);
  return [
    { value: null, label: copy.filterAll },
    ...LISTING_MAPPING_STATE_ORDER.map((value) => ({
      value,
      label: copy.mappingState[value],
    })),
  ];
}

type ListingText = Pick<
  IntegrationListingRowView,
  'title' | 'variantName' | 'platformSkuId' | 'storeSkuText'
>;

/** `Title - Variant`; the provider SKU ID when the title is blank. */
export function listingDisplayTitle(row: ListingText): string {
  const title = row.title?.trim() || row.platformSkuId;
  const variant = row.variantName?.trim();
  return variant ? `${title} - ${variant}` : title;
}

/** Trimmed Store SKU text, or `noStoreSku` when blank. */
export function listingStoreSku(
  row: ListingText,
  lang: IntegrationLang = 'id'
): string {
  const copy = getIntegrationListingReviewCopy(lang);
  return row.storeSkuText?.trim() || copy.noStoreSku;
}

/** Integer cents as whole rupiah (`Rp1.250.000`); null when unknown. */
export function formatPreviewTotal(cents: number | null): string | null {
  if (cents === null || !Number.isFinite(cents)) return null;
  return `Rp${Math.round(cents / 100).toLocaleString('id-ID')}`;
}

const WHEN = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Jakarta',
});

/** `24/10, 17:02 WIB`, or null when missing or invalid. */
export function formatPreviewTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : `${WHEN.format(date)} WIB`;
}
