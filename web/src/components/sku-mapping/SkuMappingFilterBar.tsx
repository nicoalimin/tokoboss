'use client';

import { useEffect, useState } from 'react';
import type {
  ConnectedStoreSlotView,
  SkuMappingOverviewQuery,
} from '@tokoboss/contracts';
import { INTEGRATION_PROVIDER_NAMES } from '@/lib/integration-copy';
import type { SkuMappingLang } from '@/lib/sku-mapping-copy';
import { SkuMappingFilterChips } from './SkuMappingFilterChips';

/**
 * Petakan Store SKU filter bar (UTA-40 / US03, RFC 05 row 34b): search input
 * (debounced 300 ms, trimmed, '' clears q), the 34a filter chips and a
 * connected-store selector (shown with 2+ stores; '' = all stores).
 * Controlled: the row 39 panel passes useSkuMappings filters + overview
 * stores and forwards each patch to setFilters.
 */

const T = {
  id: { search: 'Cari SKU', hint: 'SKU, nama, barcode, Store SKU' },
  en: { search: 'Search SKUs', hint: 'SKU, name, barcode, Store SKU' },
};
const STORE = { id: ['Toko', 'Semua toko'], en: ['Store', 'All stores'] };
const FIELD =
  'mt-1 min-h-[44px] w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm';
const LABEL = 'text-sm font-medium text-neutral-700';

export interface SkuMappingFilterBarProps {
  filters: SkuMappingOverviewQuery;
  stores: ConnectedStoreSlotView[];
  onChange: (patch: Partial<SkuMappingOverviewQuery>) => void;
  disabled?: boolean;
  lang?: SkuMappingLang;
}

export function SkuMappingFilterBar({
  filters,
  stores,
  onChange,
  disabled = false,
  lang = 'id',
}: Readonly<SkuMappingFilterBarProps>) {
  const t = T[lang] ?? T.id;
  const [storeLabel, allStores] = STORE[lang] ?? STORE.id;
  const [text, setText] = useState(filters.q ?? '');
  useEffect(() => {
    const next = text.trim();
    if (next === (filters.q ?? '')) return;
    const timer = setTimeout(() => onChange({ q: next || undefined }), 300);
    return () => clearTimeout(timer);
  }, [text, filters.q, onChange]);
  return (
    <div data-testid="sku-mapping-filter-bar" className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className={`flex-1 ${LABEL}`}>
          {t.search}
          <input
            type="search"
            data-testid="sku-mapping-search"
            value={text}
            placeholder={t.hint}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
            className={FIELD}
          />
        </label>
        {stores.length > 1 ? (
          <label className={`sm:w-64 ${LABEL}`}>
            {storeLabel}
            <select
              data-testid="sku-mapping-store"
              value={filters.connectionId ?? ''}
              disabled={disabled}
              onChange={(e) =>
                onChange({ connectionId: e.target.value || undefined })
              }
              className={FIELD}
            >
              <option value="">{allStores}</option>
              {stores.map((s) => (
                <option key={s.connectionId} value={s.connectionId}>
                  {`${INTEGRATION_PROVIDER_NAMES[s.provider]} · ${s.displayName ?? s.providerStoreId}`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <SkuMappingFilterChips
        value={filters.filter ?? 'all'}
        onChange={(filter) => onChange({ filter })}
        disabled={disabled}
        lang={lang}
      />
    </div>
  );
}
