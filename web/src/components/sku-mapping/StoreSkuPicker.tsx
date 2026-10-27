import type {
  ConnectedStoreSlotView,
  StagedListingCandidateView,
} from '@tokoboss/contracts';
import { INTEGRATION_PROVIDER_NAMES } from '@/lib/integration-copy';
import { getSkuMappingCopy, type SkuMappingLang } from '@/lib/sku-mapping-copy';
import { getSkuMappingStatusCopy } from '@/lib/sku-mapping-status-copy';

/**
 * Empty store slot under a SKU TokoBoss card (UTA-40 / US03, RFC 05 row 35a):
 * "<Provider> · <Store>" + a "Pilih Store SKU" select over that store's
 * staged candidates (onPick(listingId) -> useSkuMappings map), and a
 * "Tinjau kecocokan ambigu" button when any candidate is ambiguous
 * (onReview -> row 37 dialog). Presentational; used by row 35b.
 */

export interface StoreSkuPickerProps {
  store: ConnectedStoreSlotView;
  candidates: StagedListingCandidateView[];
  onPick: (listingId: string) => void;
  onReview?: (candidate: StagedListingCandidateView) => void;
  disabled?: boolean;
  lang?: SkuMappingLang;
}

export function StoreSkuPicker({
  store,
  candidates,
  onPick,
  onReview,
  disabled = false,
  lang = 'id',
}: Readonly<StoreSkuPickerProps>) {
  const copy = getSkuMappingCopy(lang);
  const status = getSkuMappingStatusCopy(lang);
  const name = store.displayName ?? store.providerStoreId;
  const ambiguous = candidates.find((c) => c.mappingState === 'ambiguous');
  return (
    <div
      data-testid="sku-mapping-store-picker"
      data-connection-id={store.connectionId}
      className="flex flex-col gap-2 rounded-xl border border-dashed border-neutral-300 p-3"
    >
      <label className="text-sm font-medium text-neutral-700">
        {`${INTEGRATION_PROVIDER_NAMES[store.provider]} · ${name}`}
        <select
          value=""
          disabled={disabled || candidates.length === 0}
          onChange={(e) => e.target.value && onPick(e.target.value)}
          className="mt-1 min-h-[44px] w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm"
        >
          <option value="">{copy.pickStoreSku}</option>
          {candidates.map((c) => (
            <option key={c.listingId} value={c.listingId}>
              {`${c.storeSkuText ?? c.platformSkuId} · ${c.title ?? '—'}`}
            </option>
          ))}
        </select>
      </label>
      {ambiguous && onReview ? (
        <button
          type="button"
          data-testid="sku-mapping-review"
          disabled={disabled}
          onClick={() => onReview(ambiguous)}
          className="min-h-[44px] self-start rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-800 disabled:opacity-50"
        >
          {status.reviewAmbiguous}
        </button>
      ) : null}
    </div>
  );
}
