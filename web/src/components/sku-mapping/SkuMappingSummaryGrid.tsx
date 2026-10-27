import type { SkuMappingOverviewResponse } from '@tokoboss/contracts';
import { getSkuMappingCopy, type SkuMappingLang } from '@/lib/sku-mapping-copy';

/**
 * Petakan Store SKU summary (UTA-40 / US03, RFC 05 row 33): the canonical
 * rule banner (SKU TokoBoss adalah sumber utama), 3 KPI cards (Store SKU
 * terpetakan, Perlu ditinjau, Belum dipetakan) from the overview summary,
 * and the bulk-map CTA "Petakan otomatis (N saran cocok)" shown only when
 * bulkCount > 0. Presentational: no fetch, no state; the row 39 panel passes
 * summary + bulkItems.length from useSkuMappings and calls bulkMap on click.
 * canEdit false (Staff) hides the CTA; busy disables it while a write runs.
 */

type Summary = SkuMappingOverviewResponse['summary'];

export interface SkuMappingSummaryGridProps {
  summary: Summary;
  bulkCount: number;
  onBulkMap: () => void;
  busy?: boolean;
  canEdit?: boolean;
  lang?: SkuMappingLang;
}

const CARD = 'rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm';

export function SkuMappingSummaryGrid({
  summary,
  bulkCount,
  onBulkMap,
  busy = false,
  canEdit = true,
  lang = 'id',
}: Readonly<SkuMappingSummaryGridProps>) {
  const copy = getSkuMappingCopy(lang);
  const kpis = [
    {
      key: 'mapped',
      label: copy.kpiMapped,
      note: copy.kpiMappedNote,
      value: summary.mappedStoreSkusCount,
    },
    {
      key: 'review',
      label: copy.kpiReview,
      note: copy.kpiReviewNote,
      value: summary.needsReviewCount,
    },
    {
      key: 'unmapped',
      label: copy.kpiUnmapped,
      note: copy.kpiUnmappedNote,
      value: summary.unmappedStoreSkusCount,
    },
  ];
  return (
    <section data-testid="sku-mapping-summary" className="flex flex-col gap-3">
      <div
        role="note"
        data-testid="sku-mapping-banner"
        className="rounded-xl border border-primary-200 bg-primary-50 p-3 text-sm text-primary-900"
      >
        <p className="font-semibold">{copy.bannerTitle}</p>
        <p className="mt-1 text-xs text-primary-800">{copy.bannerBody}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {kpis.map((k) => (
          <div
            key={k.key}
            data-testid="sku-mapping-kpi"
            data-kpi={k.key}
            className={CARD}
          >
            <p className="text-sm font-medium text-neutral-700">{k.label}</p>
            <p className="mt-1 text-2xl font-semibold text-neutral-900">
              {k.value}
            </p>
            <p className="text-xs text-neutral-500">{k.note}</p>
          </div>
        ))}
      </div>
      {canEdit && bulkCount > 0 ? (
        <button
          type="button"
          data-testid="sku-mapping-bulk-map"
          disabled={busy}
          onClick={onBulkMap}
          className="inline-flex min-h-[44px] items-center self-start rounded-xl bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-50"
        >
          {copy.bulkMap(bulkCount)}
        </button>
      ) : null}
    </section>
  );
}
