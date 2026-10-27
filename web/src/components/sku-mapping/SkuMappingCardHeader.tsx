import type { TokobossSkuMappingCardView } from '@tokoboss/contracts';
import { getSkuMappingCopy, type SkuMappingLang } from '@/lib/sku-mapping-copy';

/**
 * Header of a primary SKU TokoBoss card (UTA-40 / US03, RFC 05 row 36a):
 * "SKU TokoBoss · <skuCode>", product · variant, "sumber stok utama · Stok
 * TokoBoss: <qty>" and the status pill (Utama, "! N perlu ditinjau",
 * Konflik stok or Bermasalah) from reviewState. Presentational; used by
 * SkuMappingVariantCard (row 36b).
 */

const STOCK_LABEL: Record<SkuMappingLang, string> = {
  id: 'Stok TokoBoss',
  en: 'TokoBoss stock',
};
const PILL = 'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold';

export interface SkuMappingCardHeaderProps {
  item: TokobossSkuMappingCardView;
  lang?: SkuMappingLang;
}

export function SkuMappingCardHeader({
  item,
  lang = 'id',
}: Readonly<SkuMappingCardHeaderProps>) {
  const copy = getSkuMappingCopy(lang);
  const state = item.reviewState;
  const [label, tone] =
    state === 'needs_review'
      ? [
          copy.needsReview(item.suggestions.length),
          'bg-amber-50 text-amber-800',
        ]
      : state === 'conflict' || state === 'issue'
        ? [copy.filters[state], 'bg-red-50 text-red-700']
        : [copy.primaryPill, 'bg-primary-50 text-primary-700'];
  const title = [item.productName, item.variantName].filter(Boolean);
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">
          {copy.skuHeader(item.skuCode)}
        </p>
        <h3 className="text-base font-semibold text-neutral-900">
          {title.join(' · ')}
        </h3>
        <p className="text-sm text-neutral-600">
          {`${copy.primarySource} · ${STOCK_LABEL[lang]}: ${item.totalStockQty}`}
        </p>
      </div>
      <span data-testid="sku-mapping-card-pill" className={`${PILL} ${tone}`}>
        {label}
      </span>
    </header>
  );
}
