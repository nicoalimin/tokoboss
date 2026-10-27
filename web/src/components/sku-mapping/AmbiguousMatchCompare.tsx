import type { StagedListingCandidateView } from '@tokoboss/contracts';
import { getSkuMappingDialogCopy } from '@/lib/sku-mapping-dialog-copy';
import type { SkuMappingLang } from '@/lib/sku-mapping-copy';

/**
 * Side-by-side body of the ambiguous match dialog (UTA-40 / US03, RFC 05
 * row 37b): the staged Store SKU (text, title · variant, store stock) next
 * to candidate SKU TokoBoss radios, plus the write error. Presentational
 * and controlled (picked / onPick); the 37c dialog owns state and confirm.
 */

export interface AmbiguousMatchOption {
  variantId: string;
  skuCode: string;
  title: string;
}

export interface AmbiguousMatchCompareProps {
  candidate: StagedListingCandidateView;
  options: AmbiguousMatchOption[];
  picked: string;
  onPick: (variantId: string) => void;
  disabled?: boolean;
  error?: string | null;
  lang?: SkuMappingLang;
}

export function AmbiguousMatchCompare({
  candidate: c,
  options,
  picked,
  onPick,
  disabled = false,
  error,
  lang = 'id',
}: Readonly<AmbiguousMatchCompareProps>) {
  const copy = getSkuMappingDialogCopy(lang);
  const title = [c.title, c.variantName].filter(Boolean).join(' · ');
  return (
    <div
      data-testid="ambiguous-match-compare"
      className="grid gap-3 md:grid-cols-2"
    >
      <div className="rounded-lg border border-neutral-200 p-3 text-sm">
        <p className="text-xs font-semibold text-neutral-500">
          {copy.storeSide}
        </p>
        <p className="font-semibold text-neutral-900">
          {c.storeSkuText ?? c.platformSkuId}
        </p>
        {title ? <p className="text-neutral-700">{title}</p> : null}
        {c.providerStock !== null ? (
          <p className="text-neutral-600">{copy.stock(c.providerStock)}</p>
        ) : null}
      </div>
      <fieldset className="space-y-1 text-sm" disabled={disabled}>
        <legend className="text-xs font-semibold text-neutral-500">
          {copy.skuSide}
        </legend>
        {options.length === 0 ? (
          <p className="text-neutral-600">{copy.noOptions}</p>
        ) : null}
        {options.map((o) => (
          <label
            key={o.variantId}
            className="flex min-h-[44px] items-center gap-2"
          >
            <input
              type="radio"
              name="ambiguous-match-variant"
              value={o.variantId}
              checked={picked === o.variantId}
              onChange={() => onPick(o.variantId)}
            />
            <span>{`${o.skuCode} · ${o.title}`}</span>
          </label>
        ))}
      </fieldset>
      {error ? (
        <p role="alert" className="text-sm text-error-700 md:col-span-2">
          {error}
        </p>
      ) : null}
    </div>
  );
}
