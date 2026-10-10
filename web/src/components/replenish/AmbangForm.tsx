'use client';

import { useState } from 'react';
import type { VariantView } from '@tokoboss/contracts';
import { updateReplenishSettings } from '@/lib/replenish-client';
import {
  ambangFormFromSettings,
  buildAmbangBody,
  type AmbangField,
  type AmbangFormValues,
} from '@/lib/replenish-settings-form';

/**
 * "Atur ambang" form for one SKU (UTA-147 slice 4e, Story 11 web).
 * Min stock is required; empty lead time / max stock clears to the store
 * default. Saves via CAS on `variant.version`; API errors go to the parent
 * via `onError` (409 / reauth handling stays with the page).
 */
export interface AmbangFormProps {
  workspaceId: string;
  variant: VariantView;
  onSaved: (variant: VariantView) => void;
  onError: (err: unknown) => void;
}

const FIELDS: { key: AmbangField; label: string; hint: string }[] = [
  { key: 'minStockQty', label: 'Stok minimum', hint: 'Wajib, angka bulat.' },
  {
    key: 'leadTimeDays',
    label: 'Lead time (hari)',
    hint: 'Kosongkan = pakai default toko.',
  },
  { key: 'maxStockQty', label: 'Stok maksimum', hint: 'Opsional.' },
];

export function AmbangForm({
  workspaceId,
  variant,
  onSaved,
  onError,
}: AmbangFormProps) {
  const [values, setValues] = useState<AmbangFormValues>(() =>
    ambangFormFromSettings({
      minStockQty: variant.minStockQty ?? null,
      leadTimeDays: variant.leadTimeDays ?? null,
      maxStockQty: variant.maxStockQty ?? null,
    })
  );
  const [errors, setErrors] = useState<Partial<Record<AmbangField, string>>>(
    {}
  );
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const result = buildAmbangBody(values, variant.version);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const saved = await updateReplenishSettings(
        workspaceId,
        variant.id,
        result.body
      );
      setNotice('Ambang tersimpan.');
      onSaved(saved);
    } catch (err) {
      onError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      noValidate
      aria-label={`Atur ambang ${variant.skuCode}`}
      className="flex flex-col gap-3"
      onSubmit={(e) => void submit(e)}
    >
      {FIELDS.map(({ key, label, hint }) => (
        <label key={key} className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-neutral-800">{label}</span>
          <input
            inputMode="numeric"
            className="rounded-lg border border-neutral-300 px-3 py-2 min-h-[44px]"
            value={values[key]}
            disabled={saving}
            aria-invalid={errors[key] ? true : undefined}
            onChange={(e) => setValues({ ...values, [key]: e.target.value })}
          />
          <span className={errors[key] ? 'text-error-500' : 'text-neutral-500'}>
            {errors[key] ?? hint}
          </span>
        </label>
      ))}
      {notice && (
        <p role="status" className="text-sm text-neutral-700">
          {notice}
        </p>
      )}
      <button
        type="submit"
        className="self-start rounded-lg bg-primary-500 px-6 py-3 min-h-[44px] font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
        disabled={saving}
      >
        {saving ? 'Menyimpan…' : 'Simpan'}
      </button>
    </form>
  );
}
