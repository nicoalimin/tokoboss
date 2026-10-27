import type {
  ConnectedStoreSlotView,
  StagedListingCandidateView,
  TokobossSkuMappingCardView,
} from '@tokoboss/contracts';
import type { SkuMappingLang } from '@/lib/sku-mapping-copy';
import { SkuMappingCardHeader } from './SkuMappingCardHeader';
import { StoreSkuPicker } from './StoreSkuPicker';
import { SubordinateStoreSlot } from './SubordinateStoreSlot';

/**
 * Primary SKU TokoBoss card (UTA-40 / US03, RFC 05 row 36b): header (36a),
 * then one SubordinateStoreSlot per mapping (35b) and a StoreSkuPicker (35a)
 * for each connected store with no mapping yet; picker candidates = card
 * suggestions + unassigned listings of that store (deduped by listingId).
 * Presentational; the row 39 panel passes data and the action callbacks.
 */

export interface SkuMappingVariantCardProps {
  item: TokobossSkuMappingCardView;
  stores: ConnectedStoreSlotView[];
  unassigned: StagedListingCandidateView[];
  onPick: (variantId: string, listingId: string) => void;
  onUnmap: (mappingId: string) => void;
  onReview?: (candidate: StagedListingCandidateView, variantId: string) => void;
  busy?: boolean;
  canEdit?: boolean;
  lang?: SkuMappingLang;
}

export function SkuMappingVariantCard({
  item,
  stores,
  unassigned,
  onPick,
  onUnmap,
  onReview,
  busy = false,
  canEdit = true,
  lang = 'id',
}: Readonly<SkuMappingVariantCardProps>) {
  const mapped = new Set(item.mappings.map((m) => m.connectionId));
  const open = stores.filter(
    (s) => s.status === 'connected' && !mapped.has(s.connectionId)
  );
  const candidatesFor = (connectionId: string) => {
    const seen = new Set<string>();
    return [...item.suggestions, ...unassigned].filter(
      (c) =>
        c.connectionId === connectionId &&
        !seen.has(c.listingId) &&
        seen.add(c.listingId)
    );
  };
  const review =
    onReview && canEdit
      ? (c: StagedListingCandidateView) => onReview(c, item.variantId)
      : undefined;
  return (
    <section
      data-testid="sku-mapping-card"
      data-variant-id={item.variantId}
      className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
    >
      <SkuMappingCardHeader item={item} lang={lang} />
      <div className="grid gap-2 md:grid-cols-2">
        {item.mappings.map((m) => (
          <SubordinateStoreSlot
            key={m.mappingId}
            mapping={m}
            onUnmap={onUnmap}
            busy={busy}
            canEdit={canEdit}
            lang={lang}
          />
        ))}
        {open.map((s) => (
          <StoreSkuPicker
            key={s.connectionId}
            store={s}
            candidates={candidatesFor(s.connectionId)}
            onPick={(listingId) => onPick(item.variantId, listingId)}
            onReview={review}
            disabled={busy || !canEdit}
            lang={lang}
          />
        ))}
      </div>
    </section>
  );
}
