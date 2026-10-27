import type { SkuMappingOverviewFilter } from '@tokoboss/contracts';
import { getSkuMappingCopy, type SkuMappingLang } from '@/lib/sku-mapping-copy';

/**
 * Petakan Store SKU filter chips (UTA-40 / US03, RFC 05 row 34a): Semua,
 * Perlu ditinjau, Belum dipetakan, Konflik stok, Bermasalah (mockup order).
 * The active chip has aria-pressed="true"; clicking another chip calls
 * onChange(value), clicking the active chip does nothing. Controlled and
 * presentational (ListingFilterChips pattern); used by the row 34b
 * SkuMappingFilterBar.
 */

export const SKU_MAPPING_FILTER_CHIPS: readonly SkuMappingOverviewFilter[] = [
  'all',
  'needs_review',
  'unmapped_sku',
  'conflict',
  'issue',
];

const CHIP =
  'inline-flex min-h-[44px] items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-50';
const ON = 'border-primary-500 bg-primary-50 text-primary-700';
const OFF = 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50';

export interface SkuMappingFilterChipsProps {
  value: SkuMappingOverviewFilter;
  onChange: (value: SkuMappingOverviewFilter) => void;
  disabled?: boolean;
  lang?: SkuMappingLang;
}

export function SkuMappingFilterChips({
  value,
  onChange,
  disabled = false,
  lang = 'id',
}: Readonly<SkuMappingFilterChipsProps>) {
  const copy = getSkuMappingCopy(lang);
  return (
    <div
      role="group"
      aria-label={copy.pageTitle}
      data-testid="sku-mapping-filter-chips"
      className="flex flex-wrap gap-2"
    >
      {SKU_MAPPING_FILTER_CHIPS.map((chip) => {
        const on = chip === value;
        return (
          <button
            key={chip}
            type="button"
            data-testid="sku-mapping-filter-chip"
            data-value={chip}
            aria-pressed={on}
            disabled={disabled}
            onClick={on ? undefined : () => onChange(chip)}
            className={`${CHIP} ${on ? ON : OFF}`}
          >
            {copy.filters[chip]}
          </button>
        );
      })}
    </div>
  );
}
