import type { MappingSyncStateView } from '@tokoboss/contracts';
import {
  ALLOCATION_PCT_PRESETS,
  STOCK_BUFFER_PRESETS,
  type MappingSyncSettingsPatch,
} from '@/lib/inventory-sync-client';
import { SyncPresetChips } from './SyncPresetChips';

/**
 * Per-mapping sync panel in the SKU mapping drawer (UTA-37 / US04, RFC 06
 * row 48b): toggle, buffer / allocation chips (48a), live preview of
 * Stok dikirim ke toko = max(0, floor(availableQty × %) − buffer) where
 * availableQty = on-hand − reserved, and Sinkronkan sekarang / Coba lagi.
 * Controlled; row 50 calls the API. canEdit false (Staff) → read-only.
 */

export interface MappingSyncConfigPopoverProps {
  state: MappingSyncStateView;
  availableQty: number | null;
  onChange: (patch: MappingSyncSettingsPatch) => void;
  onSync: () => void;
  busy?: boolean;
  canEdit?: boolean;
}

export function previewPushQty(available: number, pct: number, buffer: number) {
  return Math.max(0, Math.floor((Math.max(0, available) * pct) / 100) - buffer);
}

export function MappingSyncConfigPopover({
  state: s,
  availableQty,
  onChange,
  onSync,
  busy = false,
  canEdit = true,
}: Readonly<MappingSyncConfigPopoverProps>) {
  const locked = !canEdit || busy;
  const retry = s.syncStatus === 'needs_attention';
  const preview =
    availableQty === null
      ? null
      : previewPushQty(availableQty, s.allocationPct, s.stockBuffer);
  return (
    <div
      data-testid="mapping-sync-config"
      className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-3"
    >
      <label className="flex min-h-[44px] items-center justify-between gap-3 text-sm font-semibold text-neutral-900">
        Aktifkan sinkronisasi stok
        <input
          type="checkbox"
          role="switch"
          data-testid="mapping-sync-toggle"
          checked={s.syncEnabled}
          disabled={locked}
          onChange={(e) => onChange({ syncEnabled: e.currentTarget.checked })}
          className="h-5 w-5"
        />
      </label>
      <SyncPresetChips
        label="Cadangan stok (unit)"
        presets={STOCK_BUFFER_PRESETS}
        value={s.stockBuffer}
        disabled={locked}
        onSelect={(n) => onChange({ stockBuffer: n })}
      />
      <SyncPresetChips
        label="Alokasi stok"
        presets={ALLOCATION_PCT_PRESETS}
        value={s.allocationPct}
        min={1}
        max={100}
        suffix="%"
        disabled={locked}
        onSelect={(n) => onChange({ allocationPct: n })}
      />
      <p data-testid="mapping-sync-preview" className="text-sm">
        Stok dikirim ke toko:{' '}
        <span className="font-semibold">{preview ?? '—'}</span>
      </p>
      <button
        type="button"
        data-testid="mapping-sync-now"
        disabled={locked || !s.syncEnabled}
        onClick={onSync}
        className="min-h-[44px] rounded-lg border border-primary-500 px-3 text-sm font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-50"
      >
        {retry ? 'Coba lagi' : 'Sinkronkan sekarang'}
      </button>
    </div>
  );
}
