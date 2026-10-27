import type { SkuMappingLang } from '@/lib/sku-mapping-copy';
import { getSkuMappingStatusCopy } from '@/lib/sku-mapping-status-copy';

/**
 * Petakan Store SKU panel notes (UTA-40 / US03, RFC 05 row 39b): the
 * load gate (loading / failed + Coba lagi) and the inline notes above the
 * card list (Staff read-only, no stores, write error, empty filter result).
 * Presentational only; row 39c SkuMappingPanel decides what to pass.
 */

const T = {
  id: [
    'Memuat pemetaan…',
    'Gagal memuat pemetaan.',
    'Coba lagi',
    'Tidak ada SKU TokoBoss yang cocok.',
  ],
  en: [
    'Loading mappings…',
    'Could not load mappings.',
    'Try again',
    'No SKU TokoBoss matches.',
  ],
};
const NOTE = 'rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700';

export function SkuMappingLoadState({
  failed,
  onRetry,
  lang = 'id',
}: Readonly<{ failed: boolean; onRetry: () => void; lang?: SkuMappingLang }>) {
  const [loading, failedCopy, retry] = T[lang] ?? T.id;
  if (!failed)
    return (
      <p role="status" className={NOTE}>
        {loading}
      </p>
    );
  return (
    <div role="alert" className={`${NOTE} flex items-center gap-3`}>
      {failedCopy}
      <button
        type="button"
        onClick={onRetry}
        className="min-h-[44px] font-semibold text-primary-700"
      >
        {retry}
      </button>
    </div>
  );
}

export interface SkuMappingPanelNotesProps {
  canEdit: boolean;
  noStores: boolean;
  empty: boolean;
  error?: string | null;
  lang?: SkuMappingLang;
}

export function SkuMappingPanelNotes({
  canEdit,
  noStores,
  empty,
  error,
  lang = 'id',
}: Readonly<SkuMappingPanelNotesProps>) {
  const status = getSkuMappingStatusCopy(lang);
  const emptyCopy = (T[lang] ?? T.id)[3];
  return (
    <>
      {canEdit ? null : (
        <p role="note" className={NOTE}>
          {status.readOnly}
        </p>
      )}
      {noStores ? <p className={NOTE}>{status.noStores}</p> : null}
      {error ? (
        <p role="alert" className={NOTE}>
          {error}
        </p>
      ) : null}
      {empty ? <p className={NOTE}>{emptyCopy}</p> : null}
    </>
  );
}
