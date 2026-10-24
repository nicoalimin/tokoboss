import type { IntegrationListingMappingState } from '@tokoboss/contracts';
import type { IntegrationLang } from '@/lib/integration-copy';
import { getIntegrationListingReviewCopy } from '@/lib/integration-listing-review-copy';
import { listingFilterOptions } from '@/lib/integration-listing-review-views';

/**
 * mapping_state filter chips for the import review list (US20 / RFC 04 task
 * 120e, CoS split of row 120): Semua (value null = no `mapping_state` query)
 * first, then the 120b review order (Belum dipetakan, Ambigu, Disarankan,
 * Terpetakan, Diabaikan). The active chip has aria-pressed="true"; clicking
 * another chip calls onChange(value), clicking the active chip does nothing.
 * Controlled and presentational: no fetch, no state; the 120f container owns
 * the filter value and reloads the listings.
 */

const CHIP =
  'inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50';
const ON = 'border-primary-500 bg-primary-50 text-primary-700';
const OFF = 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50';

export interface ListingFilterChipsProps {
  value: IntegrationListingMappingState | null;
  onChange: (value: IntegrationListingMappingState | null) => void;
  disabled?: boolean;
  lang?: IntegrationLang;
}

export function ListingFilterChips({
  value,
  onChange,
  disabled = false,
  lang = 'id',
}: Readonly<ListingFilterChipsProps>) {
  const copy = getIntegrationListingReviewCopy(lang);
  return (
    <div
      role="group"
      aria-label={copy.listingsHeading}
      data-testid="listing-filter-chips"
      className="flex flex-wrap gap-2"
    >
      {listingFilterOptions(lang).map((option) => {
        const on = option.value === value;
        const key = option.value ?? 'all';
        return (
          <button
            key={key}
            type="button"
            data-testid="listing-filter-chip"
            data-value={key}
            aria-pressed={on}
            disabled={disabled}
            onClick={on ? undefined : () => onChange(option.value)}
            className={`${CHIP} ${on ? ON : OFF}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
