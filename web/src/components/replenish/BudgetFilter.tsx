'use client';

import { useState } from 'react';

/**
 * Optional purchase budget for the Stok tipis list (UTA-147 slice 6a,
 * Story 11 web). The operator types a whole-rupiah amount; the parent
 * reloads recommendations with `budgetCents` (the API trims suggestions
 * by HPP). Empty or invalid input never reaches the parent.
 */
export interface BudgetFilterProps {
  budgetCents: number | null;
  disabled?: boolean;
  onApply: (budgetCents: number | null) => void;
}

const buttonClass =
  'rounded-lg border border-neutral-300 bg-white px-3 py-2 min-h-[44px] text-sm ' +
  'font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50';

/** Parse a whole-rupiah string ("1.500.000" ok) into cents; null if invalid. */
export function parseBudgetRupiah(raw: string): number | null {
  const digits = raw.replace(/[.\s]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const rupiah = Number(digits);
  if (!Number.isSafeInteger(rupiah * 100) || rupiah <= 0) return null;
  return rupiah * 100;
}

export function BudgetFilter({
  budgetCents,
  disabled = false,
  onApply,
}: BudgetFilterProps) {
  const [raw, setRaw] = useState(
    budgetCents === null ? '' : String(budgetCents / 100)
  );
  const [invalid, setInvalid] = useState(false);

  const apply = () => {
    const cents = parseBudgetRupiah(raw);
    setInvalid(cents === null);
    if (cents !== null) onApply(cents);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm text-neutral-800">
        Batas budget belanja (Rp, opsional)
        <input
          inputMode="numeric"
          className="rounded-lg border border-neutral-300 px-3 py-2 min-h-[44px]"
          value={raw}
          disabled={disabled}
          onChange={(e) => setRaw(e.target.value)}
        />
      </label>
      {invalid && (
        <p role="alert" className="text-sm text-error-800">
          Isi angka rupiah lebih dari 0, tanpa koma.
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={disabled}
          onClick={apply}
        >
          Terapkan budget
        </button>
        {budgetCents !== null && (
          <button
            type="button"
            className={buttonClass}
            disabled={disabled}
            onClick={() => {
              setRaw('');
              setInvalid(false);
              onApply(null);
            }}
          >
            Hapus budget
          </button>
        )}
      </div>
    </div>
  );
}
