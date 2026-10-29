import type { StoreHealthRowView } from '@/lib/integration-management-views';
import { INTEGRATION_PROVIDER_NAMES } from '@/lib/integration-copy';
import {
  DRAWER_PILL,
  DRAWER_TONE_CLASS,
} from './IntegrationStoreDrawerSections';

/**
 * Store detail Setup Checklist & capability profile card (UTA-38 / US18,
 * RFC 07 row 35), mockup Screen 2 right card: the 5 steps from the row 23b
 * `checklist` (evaluated at read time, no cron), with an explicit
 * `Manual di Seller Center` badge when the adapter cannot do pickup/labels.
 * Presentational only.
 */

type Step = StoreHealthRowView['checklist'][number];
type Tone = keyof typeof DRAWER_TONE_CLASS | 'neutral';

const STEP_LABELS: Record<Step['key'], string> = {
  oauth_connected: '1. Otorisasi OAuth (~30h)',
  warehouse_linked: '2. Gudang sumber stok',
  sku_mapped: '3. Pemetaan Store SKU (US03)',
  stock_sync_active: '4. Sinkronisasi stok (US04)',
  pickup_and_labels: '5. Jadwal pickup & label',
};

const STATE_BADGE: Record<Step['state'], [string, Tone]> = {
  complete: ['Selesai', 'ok'],
  attention: ['Perlu perhatian', 'warn'],
  incomplete: ['Belum diatur', 'neutral'],
  paused: ['Dijeda', 'sky'],
  supported: ['Otomatis API', 'ok'],
  manual: ['Manual di Seller Center', 'warn'],
  unknown: ['Belum diketahui', 'neutral'],
};

/** Badge text: completed steps show the store's own facts (mockup). */
export function setupStepBadge(row: StoreHealthRowView, step: Step): string {
  const { metrics: m, health } = row;
  if (step.state === 'attention' && step.key === 'oauth_connected') {
    return health.tokenExpiryLabel ?? 'Perlu otorisasi ulang';
  }
  if (step.state !== 'complete') return STATE_BADGE[step.state][0];
  if (step.key === 'oauth_connected') return 'Terhubung';
  if (step.key === 'warehouse_linked') {
    return m.linkedWarehouseCodes.join(' + ') || 'Terhubung';
  }
  if (step.key === 'sku_mapped') return `${m.mappedSkuCount} SKU`;
  if (step.key === 'stock_sync_active') return 'Aktif';
  return STATE_BADGE.complete[0];
}

export function StoreSetupChecklistCard({
  row,
}: Readonly<{ row: StoreHealthRowView }>) {
  const { connection: c, checklist } = row;
  return (
    <section
      data-testid="store-setup-checklist"
      className="rounded-lg border border-neutral-200 p-4 text-sm"
    >
      <b>Daftar Periksa Pengaturan Toko (Setup Checklist) & Profil Kemampuan</b>
      <p className="mb-2 mt-1 text-xs text-neutral-600">
        {INTEGRATION_PROVIDER_NAMES[c.provider]} ·{' '}
        {c.storeName ?? c.providerStoreId} — fitur yang tidak didukung API
        menampilkan langkah manual yang akurat.
      </p>
      <ul className="divide-y divide-neutral-100">
        {checklist.map((step) => {
          const tone = STATE_BADGE[step.state][1];
          const toneClass =
            tone === 'neutral'
              ? 'bg-neutral-100 text-neutral-700'
              : DRAWER_TONE_CLASS[tone];
          return (
            <li
              key={step.key}
              data-testid={`setup-step-${step.key}`}
              data-state={step.state}
              className="flex items-center justify-between gap-2 py-2"
            >
              <span>{STEP_LABELS[step.key]}</span>
              <span className={`${DRAWER_PILL} ${toneClass}`}>
                {setupStepBadge(row, step)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
