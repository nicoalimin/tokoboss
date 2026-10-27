'use client';

import { useEffect, useState } from 'react';
import type { StagedListingCandidateView } from '@tokoboss/contracts';
import { getSkuMappingDialogCopy } from '@/lib/sku-mapping-dialog-copy';
import type { SkuMappingLang } from '@/lib/sku-mapping-copy';
import {
  AmbiguousMatchCompare,
  type AmbiguousMatchOption,
} from './AmbiguousMatchCompare';

/**
 * Ambiguous match review + remap confirm modal (UTA-40 / US03, RFC 05 row
 * 37c). `currentSkuCode` (409 SKU_MAPPING_ALREADY_ASSIGNED; null = unknown)
 * switches to the remap prompt. Row 39 keys it by listingId, resolves
 * options and calls useSkuMappingActions.map (allowRemap + expectedVersion).
 */

export interface AmbiguousMatchDialogProps {
  candidate: StagedListingCandidateView | null;
  options: AmbiguousMatchOption[];
  defaultVariantId?: string;
  currentSkuCode?: string | null;
  busy?: boolean;
  error?: string | null;
  onConfirm: (variantId: string) => void;
  onCancel: () => void;
  lang?: SkuMappingLang;
}

const BTN =
  'min-h-[44px] flex-1 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60';

export function AmbiguousMatchDialog(p: Readonly<AmbiguousMatchDialogProps>) {
  const { candidate, options, busy = false, onCancel, lang = 'id' } = p;
  const copy = getSkuMappingDialogCopy(lang);
  const [picked, setPicked] = useState(p.defaultVariantId ?? '');
  useEffect(() => {
    if (!candidate) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [candidate, busy, onCancel]);
  if (!candidate) return null;
  const remap = p.currentSkuCode !== undefined;
  const target = options.find((o) => o.variantId === picked);
  const cur = p.currentSkuCode ?? copy.otherSku;
  const sku = target?.skuCode ?? '-';
  return (
    <div
      className="fixed inset-0 z-modal flex items-end justify-center bg-neutral-900/40 p-4 sm:items-center"
      role="presentation"
      onClick={busy ? undefined : onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ambiguous-match-title"
        data-testid="ambiguous-match-dialog"
        className="w-full max-w-lg space-y-3 rounded-xl bg-white p-5 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="ambiguous-match-title" className="text-base font-semibold">
          {remap ? copy.remapTitle : copy.reviewTitle}
        </h2>
        <p className="text-sm text-neutral-600">
          {remap ? copy.remapBody(cur, sku) : copy.reviewBody(options.length)}
        </p>
        <AmbiguousMatchCompare
          candidate={candidate}
          options={options}
          picked={picked}
          onPick={setPicked}
          disabled={busy}
          error={p.error}
          lang={lang}
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || !target}
            onClick={() => target && p.onConfirm(target.variantId)}
            className={`${BTN} bg-primary-600 text-white hover:bg-primary-700`}
          >
            {busy ? copy.busy : remap ? copy.confirmRemap : copy.confirmMap}
          </button>
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            disabled={busy}
            className={`${BTN} border border-neutral-300 bg-white text-neutral-800`}
          >
            {copy.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
