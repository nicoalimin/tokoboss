import type { SubordinateStoreSkuView } from '@tokoboss/contracts';
import { INTEGRATION_PROVIDER_NAMES } from '@/lib/integration-copy';
import { getSkuMappingCopy, type SkuMappingLang } from '@/lib/sku-mapping-copy';
import { getSkuMappingStatusCopy } from '@/lib/sku-mapping-status-copy';
import { SyncStatusBadge, type SyncStatusBadgeProps } from './SyncStatusBadge';

/**
 * Mapped Store SKU row under a SKU TokoBoss card (UTA-40 / US03, RFC 05
 * row 35b): "<Provider> · <Store> · Store SKU <sku>", listing title /
 * variant, stock conflict badge (Toko vs TokoBoss) or the stock pair,
 * lifecycle badge (dihapus / dijeda / ...) and "Lepas pemetaan"
 * (onUnmap(mappingId); hidden when canEdit is false). Empty store slots
 * use StoreSkuPicker (row 35a); the row 36 card renders both.
 */

const PILL = 'rounded-full px-2 py-0.5 text-xs font-semibold';
const NAMES: Record<string, string> = INTEGRATION_PROVIDER_NAMES;

export interface SubordinateStoreSlotProps {
  mapping: SubordinateStoreSkuView;
  onUnmap: (mappingId: string) => void;
  busy?: boolean;
  canEdit?: boolean;
  lang?: SkuMappingLang;
  /** Story 04 sync state (RFC 06 row 49); absent → Mati. */
  syncState?: SyncStatusBadgeProps['state'];
}

export function SubordinateStoreSlot({
  mapping: m,
  onUnmap,
  busy = false,
  canEdit = true,
  lang = 'id',
  syncState = null,
}: Readonly<SubordinateStoreSlotProps>) {
  const copy = getSkuMappingCopy(lang);
  const status = getSkuMappingStatusCopy(lang);
  const store = m.storeDisplayName ?? m.shopExtId;
  const sku = m.storeSkuText ?? m.platformSkuId;
  const title = [m.listingTitle, m.variantName].filter(Boolean).join(' · ');
  const stock = m.providerStock;
  return (
    <div
      data-testid="sku-mapping-slot"
      data-mapping-id={m.mappingId}
      className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-3 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-semibold text-neutral-900">
          {copy.storeSku(NAMES[m.channel] ?? m.channel, store, sku)}
        </p>
        {title ? <p className="text-sm text-neutral-600">{title}</p> : null}
        <div className="flex flex-wrap gap-2">
          {m.hasStockConflict && stock !== null ? (
            <span
              data-testid="sku-mapping-conflict"
              className={`${PILL} bg-red-50 text-red-700`}
            >
              {status.conflict(stock, m.tokobossStockQty)}
            </span>
          ) : (
            <span className={`${PILL} bg-primary-50 text-primary-700`}>
              {status.following}
            </span>
          )}
          {m.lifecycleIssue ? (
            <span
              data-testid="sku-mapping-lifecycle"
              className={`${PILL} bg-amber-50 text-amber-800`}
            >
              {status.lifecycle[m.lifecycleIssue]}
            </span>
          ) : null}
          <SyncStatusBadge state={syncState} />
        </div>
        {stock !== null ? (
          <p className="text-xs text-neutral-500">
            {status.stockPair(stock, m.tokobossStockQty)}
          </p>
        ) : null}
      </div>
      {canEdit ? (
        <button
          type="button"
          data-testid="sku-mapping-unmap"
          disabled={busy}
          onClick={() => onUnmap(m.mappingId)}
          className="min-h-[44px] shrink-0 rounded-lg border border-neutral-300 px-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          {status.unmap}
        </button>
      ) : null}
    </div>
  );
}
