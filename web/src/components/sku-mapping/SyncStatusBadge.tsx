import type { MappingSyncStateView } from '@tokoboss/contracts';
import { SYNC_STATUS_LABEL } from '@/lib/inventory-sync-client';

/**
 * Story 04 sync status badge for a mapped Store SKU slot (UTA-37 / US04,
 * RFC 06 row 49a): Mati / Menyinkronkan / Tersinkron / Perlu tindakan
 * pill (no state yet → Mati) plus "Diinginkan X · Terkirim Y · <waktu>"
 * from desiredQty / lastPushedQty / lastSyncedAt. Row 49b renders it in
 * SubordinateStoreSlot.
 */

const PILL = 'rounded-full px-2 py-0.5 text-xs font-semibold';
const TONE = {
  off: 'bg-neutral-100 text-neutral-600',
  syncing: 'bg-info-50 text-info-700',
  synced: 'bg-primary-50 text-primary-700',
  needs_attention: 'bg-amber-50 text-amber-800',
} as const;

/** "baru saja" / "5 mnt lalu" / "3 jam lalu" / "2 hari lalu". */
export function syncedAgo(iso: string, now: number = Date.now()) {
  const min = Math.max(0, Math.floor((now - Date.parse(iso)) / 60000));
  if (min < 1) return 'baru saja';
  if (min < 60) return `${min} mnt lalu`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} jam lalu` : `${Math.floor(h / 24)} hari lalu`;
}

export interface SyncStatusBadgeProps {
  state?: MappingSyncStateView | null;
  now?: number;
}

export function SyncStatusBadge({
  state,
  now,
}: Readonly<SyncStatusBadgeProps>) {
  const status = state?.syncStatus ?? 'off';
  const parts = [
    state?.desiredQty != null ? `Diinginkan ${state.desiredQty}` : null,
    state?.lastPushedQty != null ? `Terkirim ${state.lastPushedQty}` : null,
    state?.lastSyncedAt ? syncedAgo(state.lastSyncedAt, now) : null,
  ].filter(Boolean);
  return (
    <span
      data-testid="sku-mapping-sync"
      data-status={status}
      className="inline-flex flex-wrap items-center gap-2"
    >
      <span className={`${PILL} ${TONE[status]}`}>
        {SYNC_STATUS_LABEL[status]}
      </span>
      {parts.length ? (
        <span className="text-xs text-neutral-500">{parts.join(' · ')}</span>
      ) : null}
    </span>
  );
}
