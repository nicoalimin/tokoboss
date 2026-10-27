'use client';

import type { SkuMappingOverviewQuery } from '@tokoboss/contracts';
import type { SkuMappingLang } from '@/lib/sku-mapping-copy';
import { useSkuMappingReview } from '@/lib/use-sku-mapping-review';
import { useSkuMappings } from '@/lib/use-sku-mappings';
import { AmbiguousMatchDialog } from './AmbiguousMatchDialog';
import { SkuMappingFilterBar } from './SkuMappingFilterBar';
import { SkuMappingHistoryPanel } from './SkuMappingHistoryPanel';
import {
  SkuMappingLoadState,
  SkuMappingPanelNotes,
} from './SkuMappingPanelNotes';
import { SkuMappingSummaryGrid } from './SkuMappingSummaryGrid';
import { SkuMappingVariantCard } from './SkuMappingVariantCard';

/**
 * Petakan Store SKU client container (UTA-40 / US03, RFC 05 row 39c):
 * useSkuMappings + the 39a review flow wired into the summary grid, filter
 * bar, SKU TokoBoss cards, ambiguous / remap dialog and history feed; 39b
 * notes cover loading, failed, read-only, no-store and empty states. Row 40
 * page passes workspaceId, canEdit (Staff false) and URL filters.
 */

export interface SkuMappingPanelProps {
  workspaceId: string;
  canEdit?: boolean;
  initialFilters?: SkuMappingOverviewQuery;
  lang?: SkuMappingLang;
}

export function SkuMappingPanel({
  workspaceId,
  canEdit = true,
  initialFilters,
  lang = 'id',
}: Readonly<SkuMappingPanelProps>) {
  const s = useSkuMappings(workspaceId, initialFilters);
  const r = useSkuMappingReview(s);
  const o = s.overview;
  const busy = s.busy !== null;
  if (!o || (s.failed && !o.items.length))
    return (
      <SkuMappingLoadState failed={s.failed} onRetry={s.retry} lang={lang} />
    );
  return (
    <div data-testid="sku-mapping-panel" className="flex flex-col gap-4">
      <SkuMappingSummaryGrid
        summary={o.summary}
        bulkCount={s.bulkItems.length}
        onBulkMap={() => void s.bulkMap(s.bulkItems)}
        busy={busy}
        canEdit={canEdit}
        lang={lang}
      />
      <SkuMappingFilterBar
        filters={s.filters}
        stores={o.stores}
        onChange={s.setFilters}
        disabled={busy}
        lang={lang}
      />
      <SkuMappingPanelNotes
        canEdit={canEdit}
        noStores={o.stores.length === 0}
        empty={o.items.length === 0}
        error={r.candidate ? null : s.error?.message}
        lang={lang}
      />
      {o.items.map((item) => (
        <SkuMappingVariantCard
          key={item.variantId}
          item={item}
          stores={o.stores}
          unassigned={o.unassignedListings}
          onPick={r.pick}
          onUnmap={(mappingId) => void s.unmap(mappingId)}
          onReview={r.open}
          busy={busy}
          canEdit={canEdit}
          lang={lang}
        />
      ))}
      <SkuMappingHistoryPanel events={s.history} lang={lang} />
      <AmbiguousMatchDialog
        key={r.candidate?.listingId ?? 'closed'}
        candidate={r.candidate}
        options={r.options}
        defaultVariantId={r.defaultVariantId}
        currentSkuCode={r.currentSkuCode}
        busy={s.busy === 'map'}
        error={r.error}
        onConfirm={r.confirm}
        onCancel={r.cancel}
        lang={lang}
      />
    </div>
  );
}
