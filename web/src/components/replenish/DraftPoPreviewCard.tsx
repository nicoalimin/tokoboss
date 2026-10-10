import type { DraftPoPreview } from '@/lib/replenish-draft';

/**
 * Draft-PO preview card (UTA-147 slice 3c, Story 11 web).
 *
 * Presentational only: the parent builds `preview` with
 * `buildDraftPoPreview` and owns the create call. Honesty rules from the
 * Story 11 mockup: no-supplier SKUs are listed as blocked, missing HPP is a
 * reminder chip (no number shown), and create is disabled with no lines.
 */
export interface DraftPoPreviewCardProps {
  preview: DraftPoPreview;
  referenceNum: string;
  creating?: boolean;
  onCreate: () => void;
  onCancel: () => void;
  /** When set, each line shows a qty input (positive integers only). */
  onQtyChange?: (variantId: string, quantity: number) => void;
}

const primaryButtonClass =
  'rounded-lg bg-primary-500 px-6 py-3 min-h-[44px] inline-flex items-center justify-center ' +
  'font-semibold text-white hover:bg-primary-600 disabled:opacity-50';

const secondaryButtonClass =
  'rounded-lg border border-neutral-300 bg-white px-4 py-2 min-h-[44px] inline-flex items-center ' +
  'justify-center font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50';

export function DraftPoPreviewCard({
  preview,
  referenceNum,
  creating = false,
  onCreate,
  onCancel,
  onQtyChange,
}: DraftPoPreviewCardProps) {
  const { lines, blockedNoSupplier, missingHppCount, canCreate } = preview;
  return (
    <section
      data-testid="draft-po-preview"
      aria-labelledby="draft-po-title"
      className="rounded-2xl border border-neutral-200 bg-white p-4"
    >
      <h2
        id="draft-po-title"
        className="text-lg font-semibold text-neutral-900"
      >
        Draft PO <span className="font-mono text-sm">{referenceNum}</span>
      </h2>
      {blockedNoSupplier.length > 0 && (
        <p
          role="alert"
          data-testid="draft-po-blocked"
          className="mt-3 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-700"
        >
          Tidak bisa buat draft PO sampai supplier dilengkapi:{' '}
          {blockedNoSupplier.join(', ')}
        </p>
      )}
      {lines.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-600">
          Belum ada SKU yang bisa dipesan.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-200 text-sm">
          {lines.map((line) => (
            <li
              key={line.variantId}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span>
                <span className="font-mono text-neutral-600">
                  {line.skuCode}
                </span>{' '}
                {line.label}
                {line.missingHpp && (
                  <span className="ml-2 rounded-full bg-warning-50 px-2 py-0.5 text-xs text-warning-700">
                    HPP kosong
                  </span>
                )}
              </span>
              {onQtyChange ? (
                <label className="flex items-center gap-1 font-semibold">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    aria-label={`Jumlah ${line.skuCode}`}
                    className="w-20 rounded-lg border border-neutral-300 px-2 py-1 min-h-[44px] text-right"
                    value={line.quantity}
                    disabled={creating}
                    onChange={(e) => {
                      const qty = Number(e.target.value);
                      if (Number.isInteger(qty) && qty > 0) {
                        onQtyChange(line.variantId, qty);
                      }
                    }}
                  />
                  pcs
                </label>
              ) : (
                <span className="font-semibold">{line.quantity} pcs</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {missingHppCount > 0 && (
        <p className="mt-2 text-xs text-neutral-600">
          {missingHppCount} SKU tanpa HPP; harga beli tidak diisi otomatis.
        </p>
      )}
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          className={primaryButtonClass}
          disabled={!canCreate || creating}
          onClick={onCreate}
        >
          {creating ? 'Membuat…' : 'Buat draft PO'}
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={creating}
          onClick={onCancel}
        >
          Batal
        </button>
      </div>
    </section>
  );
}
