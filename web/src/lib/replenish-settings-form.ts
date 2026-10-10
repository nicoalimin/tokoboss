/**
 * Ambang form helpers (UTA-147 slice 4c, Story 11 web).
 *
 * Pure functions (no fetch, no React) that turn the raw text inputs of the
 * "Ambang" form (min stock / lead time / max stock) into an
 * `UpdateReplenishSettingsBody`, with honest Bahasa Indonesia validation
 * errors. Min stock is required; an empty lead time or max stock clears the
 * value (sent as null). Nothing is guessed or rounded.
 */

import type { UpdateReplenishSettingsBody } from '@tokoboss/contracts';

export interface AmbangFormValues {
  minStockQty: string;
  leadTimeDays: string;
  maxStockQty: string;
}

export type AmbangField = keyof AmbangFormValues;

export type AmbangFormResult =
  | { ok: true; body: UpdateReplenishSettingsBody }
  | { ok: false; errors: Partial<Record<AmbangField, string>> };

export interface AmbangSettings {
  minStockQty: number | null;
  leadTimeDays: number | null;
  maxStockQty: number | null;
}

const WHOLE_NUMBER = /^\d+$/;

/** null = empty input; 'invalid' = not a whole number >= 0. */
function parseWhole(raw: string): number | null | 'invalid' {
  const text = raw.trim();
  if (text === '') return null;
  if (!WHOLE_NUMBER.test(text)) return 'invalid';
  const n = Number(text);
  return Number.isSafeInteger(n) ? n : 'invalid';
}

/** Initial form text from the current settings (null shows as empty). */
export function ambangFormFromSettings(
  settings: AmbangSettings
): AmbangFormValues {
  const text = (n: number | null) => (n === null ? '' : String(n));
  return {
    minStockQty: text(settings.minStockQty),
    leadTimeDays: text(settings.leadTimeDays),
    maxStockQty: text(settings.maxStockQty),
  };
}

/** Validate the form and build the PATCH body (CAS on expectedVersion). */
export function buildAmbangBody(
  values: AmbangFormValues,
  expectedVersion: number
): AmbangFormResult {
  const errors: Partial<Record<AmbangField, string>> = {};
  const min = parseWhole(values.minStockQty);
  const lead = parseWhole(values.leadTimeDays);
  const max = parseWhole(values.maxStockQty);
  if (min === null) {
    errors.minStockQty = 'Stok minimum wajib diisi.';
  } else if (min === 'invalid') {
    errors.minStockQty = 'Stok minimum harus angka bulat 0 atau lebih.';
  }
  if (lead === 'invalid') {
    errors.leadTimeDays = 'Lama kirim harus angka bulat (hari), 0 atau lebih.';
  }
  if (max === 'invalid') {
    errors.maxStockQty = 'Stok maksimum harus angka bulat 0 atau lebih.';
  }
  if (
    min === null ||
    min === 'invalid' ||
    lead === 'invalid' ||
    max === 'invalid'
  ) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    body: {
      expectedVersion,
      minStockQty: min,
      leadTimeDays: lead,
      maxStockQty: max,
    },
  };
}
