'use client';

import { useEffect, useState } from 'react';
import { searchCatalog, type VariantView } from '@/lib/catalog-client';

const FIELD = 'mt-1 min-h-11 w-full rounded-lg border border-neutral-300 px-3';
const T = {
  label: 'Cari SKU',
  placeholder: 'Nama, SKU, atau barcode',
  selected: (n: number) => `${n} SKU dipilih`,
  none: 'Tidak ada SKU yang cocok.',
  failed: 'Pencarian gagal. Coba lagi.',
};

export interface StartCountSkuPickerProps {
  workspaceId: string;
  selected: string[];
  onChange: (variantIds: string[]) => void;
}

/**
 * "SKU terpilih" picker for the Stock Opname start form (US12 / RFC 03 task
 * 44e, mockup 1): searches the catalog (name / SKU / barcode, debounced) and
 * toggles active variants. Ids only; the form clears them when the warehouse
 * changes. Phone-first, 44 px targets.
 */
export function StartCountSkuPicker(props: StartCountSkuPickerProps) {
  const { workspaceId, selected, onChange } = props;
  const [q, setQ] = useState('');
  const [results, setResults] = useState<VariantView[]>([]);
  const [done, setDone] = useState('');
  const [error, setError] = useState(false);
  const term = q.trim();

  useEffect(() => {
    if (term === '') return;
    let off = false;
    const t = setTimeout(() => {
      searchCatalog(workspaceId, term)
        .then((r) => {
          if (off) return;
          setError(false);
          setResults(r.variants.filter((v) => v.status === 'active'));
          setDone(term);
        })
        .catch(() => !off && setError(true));
    }, 250);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [workspaceId, term]);

  const shown = term === '' ? [] : results;

  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id]
    );
  }

  return (
    <div data-testid="opname-sku-picker" className="mt-2 space-y-2 pl-6">
      <label className="block text-neutral-700">
        {T.label}
        <input
          type="search"
          value={q}
          placeholder={T.placeholder}
          onChange={(e) => setQ(e.target.value)}
          className={FIELD}
        />
      </label>
      <p className="text-neutral-600">{T.selected(selected.length)}</p>
      {error && (
        <p role="alert" className="text-red-700">
          {T.failed}
        </p>
      )}
      {!error && term !== '' && done === term && shown.length === 0 && (
        <p className="text-neutral-500">{T.none}</p>
      )}
      <ul className="divide-y divide-neutral-100">
        {shown.map((v) => (
          <li key={v.id}>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={selected.includes(v.id)}
                onChange={() => toggle(v.id)}
              />
              <span className="font-mono">{v.skuCode}</span>
              <span className="truncate text-neutral-600">
                {v.name ?? v.listingName ?? ''}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
