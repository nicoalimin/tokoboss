import type { UpdateConnectionControlsBody } from '@tokoboss/contracts';
import type { StoreHealthRowView } from '@/lib/integration-management-views';
import { INTEGRATION_PROVIDER_NAMES } from '@/lib/integration-copy';
import {
  CAPABILITY_CONTROLS,
  capabilityImpactNote,
} from '@/lib/integration-capability-controls-copy';
import {
  DRAWER_PILL,
  DRAWER_TONE_CLASS,
} from './IntegrationStoreDrawerSections';

/**
 * Store detail Kontrol Kemampuan card (UTA-38 / US18, RFC 07 row 34b),
 * mockup Screen 2 left card: independent Impor Order Masuk / Sinkronisasi
 * Stok Keluar (US04) switches, the impact note (`#capImpactNote`) and the
 * Admin resume + on-request reconcile button. Switches lock for non-Admin
 * and needs_reauth / disconnected. The parent sends the PATCH.
 */

export interface StoreCapabilityControlsCardProps {
  row: StoreHealthRowView;
  isAdmin: boolean;
  /** PATCH .../controls body; the parent calls the row 29 client. */
  onChange?: (body: UpdateConnectionControlsBody) => void;
  /** Replaces the impact note, e.g. after a resume + reconcile. */
  notice?: string;
}

export function StoreCapabilityControlsCard({
  row,
  isAdmin,
  onChange,
  notice,
}: Readonly<StoreCapabilityControlsCardProps>) {
  const { connection: c, health } = row;
  const { status } = health;
  const locked =
    !isAdmin || status === 'needs_reauth' || status === 'disconnected';
  return (
    <section
      data-testid="store-capability-controls"
      className="rounded-lg border border-neutral-200 p-4 text-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <b>
          Kontrol Kemampuan: {INTEGRATION_PROVIDER_NAMES[c.provider]} ·{' '}
          {c.storeName ?? c.providerStoreId}
        </b>
        <span className={`${DRAWER_PILL} ${DRAWER_TONE_CLASS[health.tone]}`}>
          {health.label}
        </span>
      </div>
      {CAPABILITY_CONTROLS.map(({ key, label, hint }) => (
        <label key={key} className="flex items-center justify-between py-2">
          <span>
            <b>{label}</b>
            <small className="block text-neutral-600">{hint}</small>
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              data-testid={`capability-switch-${key}`}
              checked={c[key]}
              disabled={locked}
              onChange={(e) => onChange?.({ [key]: e.target.checked })}
            />
            {c[key] ? 'Aktif' : 'Dijeda Admin'}
          </span>
        </label>
      ))}
      <p id="capImpactNote" className="rounded-lg bg-neutral-50 p-3 text-xs">
        {notice ?? capabilityImpactNote(row)}
      </p>
      <div className="mt-2.5 flex items-center gap-2">
        {isAdmin ? (
          <button
            type="button"
            data-testid="capability-resume-reconcile"
            disabled={locked}
            className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            onClick={() =>
              onChange?.({ inventorySyncEnabled: true, reconcileNow: true })
            }
          >
            ▶ Lanjutkan Sinkron Stok &amp; Rekonsiliasi Sekarang
          </button>
        ) : (
          <span className={`${DRAWER_PILL} bg-neutral-100 text-neutral-700`}>
            🔒 Hanya Admin yang dapat menjeda/melanjutkan
          </span>
        )}
      </div>
    </section>
  );
}
