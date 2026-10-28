/**
 * Preset chips + custom number input for the per-mapping inventory sync
 * panel (UTA-37 / US04, RFC 06 row 48a): safety stock buffer (0/2/5/10
 * unit) or allocation (100/80/50 %). Clicking a chip calls onSelect(n);
 * a custom value commits on blur / Enter when it is an integer within
 * [min, max] (default 0–100000). disabled → read-only (Staff). Used by row 48b
 * MappingSyncConfigPopover.
 */

const CHIP =
  'inline-flex min-h-[44px] items-center rounded-full border px-3 text-xs font-semibold disabled:opacity-50';
const ON = 'border-primary-500 bg-primary-50 text-primary-700';
const OFF = 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50';

export interface SyncPresetChipsProps {
  label: string;
  presets: readonly number[];
  value: number;
  onSelect: (value: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  disabled?: boolean;
}

export function SyncPresetChips({
  label,
  presets,
  value,
  onSelect,
  min = 0,
  max = 100000,
  suffix = '',
  disabled = false,
}: Readonly<SyncPresetChipsProps>) {
  const commit = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isInteger(n)) return;
    if (n >= min && n <= max && n !== value) onSelect(n);
  };
  return (
    <div role="group" aria-label={label} data-testid="sync-preset-chips">
      <p className="mb-1 text-xs font-semibold text-neutral-600">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            data-value={p}
            aria-pressed={p === value}
            disabled={disabled}
            onClick={p === value ? undefined : () => onSelect(p)}
            className={`${CHIP} ${p === value ? ON : OFF}`}
          >
            {p}
            {suffix}
          </button>
        ))}
        <input
          key={value}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          disabled={disabled}
          defaultValue={presets.includes(value) ? '' : value}
          placeholder="Lainnya"
          aria-label={`${label} lainnya`}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(e.currentTarget.value);
          }}
          className="min-h-[44px] w-24 rounded-lg border border-neutral-300 px-2 text-sm disabled:opacity-50"
        />
      </div>
    </div>
  );
}
