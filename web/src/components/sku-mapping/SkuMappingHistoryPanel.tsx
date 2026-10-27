import type {
  SkuMappingAction,
  SkuMappingHistoryEventView,
} from '@tokoboss/contracts';
import { INTEGRATION_PROVIDER_NAMES } from '@/lib/integration-copy';
import { formatPreviewTime } from '@/lib/integration-listing-review-views';
import { getSkuMappingCopy, type SkuMappingLang } from '@/lib/sku-mapping-copy';
import { getSkuMappingStatusCopy } from '@/lib/sku-mapping-status-copy';

/**
 * Mapping history feed (UTA-40 / US03, RFC 05 row 38): collapsible section
 * (native <details>, open by default), newest first as returned by the API;
 * each row = action badge, "<Provider> · <Store> · Store SKU <sku>", the
 * SKU TokoBoss move (previous → current; unmapped strikes it through) and
 * "<actor> · <dd/MM, HH:mm WIB>". Presentational; the row 39 panel passes
 * useSkuMappings().history (loading / failed states stay in row 39).
 */

const PILL = 'rounded-full px-2 py-0.5 text-xs font-semibold';
const NAMES: Record<string, string> = INTEGRATION_PROVIDER_NAMES;
const TONE: Record<SkuMappingAction, string> = {
  mapped: 'bg-primary-50 text-primary-700',
  bulk_mapped: 'bg-primary-50 text-primary-700',
  remapped: 'bg-amber-50 text-amber-800',
  unmapped: 'bg-neutral-100 text-neutral-700',
  restored: 'bg-emerald-50 text-emerald-700',
};

export interface SkuMappingHistoryPanelProps {
  events: SkuMappingHistoryEventView[];
  defaultOpen?: boolean;
  lang?: SkuMappingLang;
}

function skuMove(e: SkuMappingHistoryEventView): string {
  const to = e.skuCode ?? '-';
  if (e.action === 'unmapped') return to;
  const from = e.previousSkuCode;
  return from && from !== to ? `${from} → ${to}` : `→ ${to}`;
}

export function SkuMappingHistoryPanel({
  events,
  defaultOpen = true,
  lang = 'id',
}: Readonly<SkuMappingHistoryPanelProps>) {
  const copy = getSkuMappingCopy(lang);
  const status = getSkuMappingStatusCopy(lang);
  return (
    <details
      open={defaultOpen}
      data-testid="sku-mapping-history"
      className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
    >
      <summary className="min-h-[44px] cursor-pointer py-2 text-base font-semibold text-neutral-900">
        {status.historyTitle} ({events.length})
      </summary>
      {events.length === 0 ? (
        <p className="py-2 text-sm text-neutral-500">{status.historyEmpty}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-neutral-100">
          {events.map((e) => (
            <li
              key={e.id}
              data-testid="sku-mapping-history-event"
              data-action={e.action}
              className="flex flex-col gap-1 py-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`${PILL} ${TONE[e.action]}`}>
                  {status.action[e.action]}
                </span>
                <span className="text-sm font-semibold text-neutral-900">
                  {copy.storeSku(
                    NAMES[e.channel] ?? e.channel,
                    e.storeDisplayName ?? e.shopExtId,
                    e.storeSkuText ?? e.platformSkuId
                  )}
                </span>
              </div>
              <p
                className={`text-sm text-neutral-700 ${e.action === 'unmapped' ? 'line-through' : ''}`}
              >
                {copy.skuHeader(skuMove(e))}
              </p>
              <p className="text-xs text-neutral-500">
                {[e.actorDisplayName, formatPreviewTime(e.createdAt)]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
