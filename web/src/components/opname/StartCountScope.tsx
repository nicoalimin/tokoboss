'use client';

import type { StockCountScopeTypeWire } from '@tokoboss/contracts';
import { getStockCountCopy } from '@/lib/stock-count-copy';

/** Renders the "SKU terpilih" picker for a warehouse (later slice). */
export type SkuPickerRender = (
  warehouseId: string,
  selected: string[],
  onChange: (variantIds: string[]) => void
) => React.ReactNode;

export interface StartCountScopeProps {
  scope: StockCountScopeTypeWire;
  onScope: (scope: StockCountScopeTypeWire) => void;
  warehouseId: string;
  variantIds: string[];
  onVariantIds: (variantIds: string[]) => void;
  renderSkuPicker?: SkuPickerRender;
}

/**
 * Scope radios for the Stock Opname start form (US12 / RFC 03 task 44b,
 * mockup 1): all SKUs, plus "SKU terpilih" only when a picker is provided.
 */
export function StartCountScope(props: StartCountScopeProps) {
  const { scope, onScope, renderSkuPicker } = props;
  const copy = getStockCountCopy('id');
  const options: [StockCountScopeTypeWire, string][] = [['all', copy.scopeAll]];
  if (renderSkuPicker) options.push(['skus', copy.scopeSkus]);
  return (
    <fieldset>
      <legend className="block font-medium text-neutral-800">
        {copy.scopeLabel}
      </legend>
      {options.map(([value, label]) => (
        <label key={value} className="flex min-h-11 items-center gap-2">
          <input
            type="radio"
            name="opname-scope"
            checked={scope === value}
            onChange={() => onScope(value)}
          />
          {label}
        </label>
      ))}
      {scope === 'skus' &&
        renderSkuPicker?.(
          props.warehouseId,
          props.variantIds,
          props.onVariantIds
        )}
    </fieldset>
  );
}
