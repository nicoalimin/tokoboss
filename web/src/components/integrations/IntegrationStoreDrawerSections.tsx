import type { StoreHealthRowView } from '@/lib/integration-management-views';
import { formatWibDateTime } from '@/lib/integration-activity-views';

/**
 * Store drawer sections (UTA-38 / US18, RFC 07 row 33a), mockup
 * `#storeDrawer`: the shared pill styles, the on-request token diagnostics
 * card (no cron) and the per-capability status pills. Row 33b
 * (`IntegrationStoreDrawer`) composes them. Presentational only.
 */

export const DRAWER_TONE_CLASS: Record<
  StoreHealthRowView['health']['tone'],
  string
> = {
  ok: 'bg-success-50 text-success-700',
  sky: 'bg-info-50 text-info-700',
  warn: 'bg-warning-50 text-warning-700',
  bad: 'bg-error-50 text-error-700',
};

export const DRAWER_PILL = 'rounded-full px-2.5 py-1 text-xs font-semibold';
const CARD = 'mt-2.5 rounded-lg border border-neutral-200 p-3 text-sm';

/** `Token 24 hari lagi · Dicek 28 Okt 2026 · 18:10 WIB [· Galat CODE]`. */
export function storeTokenDiagnostic(row: StoreHealthRowView): string {
  const { connection: c, health } = row;
  const parts = [
    health.tokenExpiryLabel ?? 'Tanpa tanggal kedaluwarsa token',
    c.lastCheckedAt
      ? `Dicek ${formatWibDateTime(new Date(c.lastCheckedAt))}`
      : 'Belum dicek',
  ];
  if (c.lastErrorCode) parts.push(`Galat ${c.lastErrorCode}`);
  return parts.join(' · ');
}

export function StoreDrawerTokenCard({
  row,
}: Readonly<{ row: StoreHealthRowView }>) {
  return (
    <div className={CARD} data-testid="store-drawer-token">
      <b>Diagnostik Token (Tanpa Cron · Evaluasi On-Request)</b>
      <p className="mt-1 text-xs text-neutral-600">
        {storeTokenDiagnostic(row)}
      </p>
    </div>
  );
}

const CAPABILITIES = [
  [
    'orderImportEnabled',
    'Impor Order Masuk',
    'Tarik pesanan & webhook penyedia',
  ],
  [
    'inventorySyncEnabled',
    'Sinkronisasi Stok Keluar (US04)',
    'Dorong stok siap jual dari ledger SKU TokoBoss',
  ],
] as const;

export function StoreDrawerCapabilityCard({
  row,
}: Readonly<{ row: StoreHealthRowView }>) {
  return (
    <div className={CARD}>
      <b>Pengaturan Jeda / Lanjutkan per Kemampuan</b>
      {CAPABILITIES.map(([key, label, hint]) => {
        const on = row.connection[key];
        return (
          <div key={key} className="flex items-center justify-between py-1.5">
            <div>
              {label}
              <small className="block text-neutral-600">{hint}</small>
            </div>
            <span
              data-testid={`store-drawer-${key}`}
              className={`${DRAWER_PILL} ${DRAWER_TONE_CLASS[on ? 'ok' : 'sky']}`}
            >
              {on ? 'Aktif' : 'Dijeda'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
