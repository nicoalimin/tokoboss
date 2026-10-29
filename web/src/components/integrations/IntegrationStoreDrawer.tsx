import type { StoreHealthRowView } from '@/lib/integration-management-views';
import { INTEGRATION_PROVIDER_NAMES } from '@/lib/integration-copy';
import {
  DRAWER_PILL,
  DRAWER_TONE_CLASS,
  StoreDrawerCapabilityCard,
  StoreDrawerTokenCard,
} from './IntegrationStoreDrawerSections';

/**
 * Detail Kesehatan & Pengaturan Toko slide-over (UTA-38 / US18, RFC 07
 * row 33b), mockup `#storeDrawer`: health pill + title, provider store ID &
 * warehouse metadata, the row 33a token / capability cards, the
 * non-destructive retention note and the Admin CTA or read-only badge.
 * Presentational: the parent owns the open state and the actions.
 */

export interface IntegrationStoreDrawerProps {
  /** The selected store; `null` keeps the drawer closed. */
  row: StoreHealthRowView | null;
  isAdmin: boolean;
  onClose: () => void;
  /** Admin CTA: opens the re-auth / disconnect confirmation. */
  onManageConnection?: (id: string) => void;
}

const BTN = 'rounded-lg px-3 py-1.5 text-xs font-semibold';

export function IntegrationStoreDrawer({
  row,
  isAdmin,
  onClose,
  onManageConnection,
}: Readonly<IntegrationStoreDrawerProps>) {
  if (!row) return null;
  const { connection: c, health, metrics } = row;
  return (
    <aside
      id="storeDrawer"
      aria-label="Detail Kesehatan & Pengaturan Toko"
      data-status={health.status}
      className="fixed right-0 top-0 z-40 h-full w-[470px] max-w-[94vw] overflow-auto border-l border-neutral-200 bg-white p-5 shadow-lg"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className={`${DRAWER_PILL} ${DRAWER_TONE_CLASS[health.tone]}`}>
            {health.label}
          </span>
          <h2 className="mt-1.5 text-base font-semibold text-neutral-900">
            {INTEGRATION_PROVIDER_NAMES[c.provider]} ·{' '}
            {c.storeName ?? c.providerStoreId}
          </h2>
        </div>
        <button
          type="button"
          className={`${BTN} bg-neutral-100`}
          onClick={onClose}
        >
          ✕ Tutup
        </button>
      </div>
      <p className="mt-1 text-xs text-neutral-600">
        ID Penyedia: {c.providerStoreId} · Gudang:{' '}
        {metrics.linkedWarehouseCodes.join(', ') || '—'} · Pemetaan:{' '}
        {metrics.mappedSkuCount} terpetakan
      </p>
      <StoreDrawerTokenCard row={row} />
      <StoreDrawerCapabilityCard row={row} />
      <p className="mt-3 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-700">
        Menjeda kemampuan atau mengotorisasi ulang toko <b>tidak pernah</b>{' '}
        menghapus pemetaan Store SKU (US03) maupun riwayat ledger (US05).
      </p>
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        {isAdmin ? (
          <button
            type="button"
            data-testid="store-drawer-admin-action"
            className={`${BTN} bg-primary-500 text-white`}
            onClick={() => onManageConnection?.(c.id)}
          >
            Otorisasi Ulang / Putuskan...
          </button>
        ) : (
          <span className={`${DRAWER_PILL} bg-neutral-100 text-neutral-700`}>
            🔒 Mode baca-saja untuk Manager/Staff
          </span>
        )}
        <button
          type="button"
          className={`${BTN} bg-neutral-100`}
          onClick={onClose}
        >
          Selesai
        </button>
      </div>
    </aside>
  );
}
