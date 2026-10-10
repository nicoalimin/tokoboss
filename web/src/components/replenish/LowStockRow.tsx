import type { LowStockRecommendationView } from '@tokoboss/contracts';

/**
 * One "Stok tipis" recommendation row (UTA-147 slice 3d, Story 11 web).
 *
 * Presentational only: the parent owns selection, dismiss/snooze calls and
 * the list. Honesty rules from the Story 11 mockup: no sales data shows
 * "Belum ada data penjualan" (no invented rate), missing supplier/HPP are
 * reminder chips, and "Kenapa?" lists the API explainability bullets as-is.
 */
export interface LowStockRowProps {
  rec: LowStockRecommendationView;
  selected: boolean;
  busy?: boolean;
  onToggle: (variantId: string) => void;
  onDismiss: (variantId: string) => void;
  onSnooze: (variantId: string) => void;
  onAmbang?: (variantId: string) => void;
}

const chipClass =
  'ml-2 rounded-full bg-warning-50 px-2 py-0.5 text-xs text-warning-700';

const actionClass =
  'rounded-lg border border-neutral-300 bg-white px-3 py-2 min-h-[44px] text-sm ' +
  'font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50';

function coverText(rec: LowStockRecommendationView): string {
  if (rec.salesRatePerDay === null || rec.stockCoverDays === null) {
    return 'Belum ada data penjualan';
  }
  return `Laku ${rec.salesRatePerDay.toFixed(1)}/hari · cukup ${Math.floor(rec.stockCoverDays)} hari`;
}

export function LowStockRow({
  rec,
  selected,
  busy = false,
  onToggle,
  onDismiss,
  onSnooze,
  onAmbang,
}: LowStockRowProps) {
  const label = rec.variantName
    ? `${rec.productName} ${rec.variantName}`
    : rec.productName;
  return (
    <li
      data-testid="low-stock-row"
      className="flex flex-col gap-2 border-b border-neutral-200 py-3"
    >
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5"
          checked={selected}
          disabled={busy}
          onChange={() => onToggle(rec.variantId)}
        />
        <span className="flex-1">
          <span className="font-mono text-sm text-neutral-600">
            {rec.skuCode}
          </span>{' '}
          <span className="font-semibold text-neutral-900">{label}</span>
          {rec.missingSupplier && (
            <span className={chipClass}>Supplier kosong</span>
          )}
          {rec.missingHpp && <span className={chipClass}>HPP kosong</span>}
          <span className="block text-sm text-neutral-600">
            Tersedia {rec.availableQty} · min {rec.minStockQty} ·{' '}
            {coverText(rec)}
          </span>
        </span>
        <span className="text-right font-semibold text-neutral-900">
          {rec.suggestedReorderQty} pcs
        </span>
      </label>
      <details className="text-sm text-neutral-700">
        <summary className="cursor-pointer text-primary-600">Kenapa?</summary>
        <ul className="mt-1 list-disc pl-5">
          {rec.explainability.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
      <div className="flex gap-2">
        <button
          type="button"
          className={actionClass}
          disabled={busy}
          onClick={() => onSnooze(rec.variantId)}
        >
          Tunda
        </button>
        <button
          type="button"
          className={actionClass}
          disabled={busy}
          onClick={() => onDismiss(rec.variantId)}
        >
          Abaikan
        </button>
        {onAmbang && (
          <button
            type="button"
            className={actionClass}
            disabled={busy}
            onClick={() => onAmbang(rec.variantId)}
          >
            Atur ambang
          </button>
        )}
      </div>
    </li>
  );
}
