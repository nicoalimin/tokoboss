import type { IntegrationKpiSummary } from '@/lib/integration-management-views';

/**
 * Integration Center KPI bar (UTA-38 / US18, RFC 07 row 30), mockup
 * Screen 1: the four health legend pills, the four workspace KPI cards
 * (row 23b `toIntegrationKpiSummary`) and the no-cron lazy token refresh
 * note (`#pusatToast`); a parent may swap in a save toast via `toast`.
 * Presentational: no fetch, no state, no actions.
 */

type LegendTone = 'ok' | 'info' | 'warn' | 'bad';

const TONE_CLASS: Record<LegendTone, string> = {
  ok: 'bg-success-50 text-success-700',
  info: 'bg-info-50 text-info-700',
  warn: 'bg-warning-50 text-warning-700',
  bad: 'bg-error-50 text-error-700',
};

const LEGEND: readonly (readonly [LegendTone, string])[] = [
  ['ok', 'Sehat · Aktif'],
  ['info', 'Dijeda sebagian / penuh'],
  ['warn', 'Token hampir kedaluwarsa (<5 hari)'],
  ['bad', 'Perlu otorisasi ulang / Terputus'],
];

const KPIS: readonly (readonly [keyof IntegrationKpiSummary, string])[] = [
  ['totalStores', 'Toko terdaftar di workspace'],
  ['healthyActiveCount', 'Sehat & aktif penuh'],
  ['pausedCount', 'Dijeda sebagian / penuh'],
  ['needsReauthCount', 'Perlu otorisasi ulang (~30 hari habis)'],
];

const LAZY_REFRESH_NOTE =
  'Access token diperbarui otomatis secara lazy saat TokoBoss menerima order atau mendorong stok. Jika refresh token (~30 hari) kedaluwarsa atau dicabut di Seller Center, status toko beralih ke Perlu otorisasi ulang tanpa menghapus pemetaan SKU.';

export interface IntegrationKpiBarProps {
  summary: IntegrationKpiSummary;
  /** Replaces the lazy-refresh note, e.g. a "Perubahan disimpan" toast. */
  toast?: string;
}

export function IntegrationKpiBar({
  summary,
  toast,
}: Readonly<IntegrationKpiBarProps>) {
  return (
    <div data-testid="integration-kpi-bar" className="flex flex-col gap-3">
      <div
        data-testid="integration-health-legend"
        className="flex flex-wrap gap-2"
      >
        {LEGEND.map(([tone, label]) => (
          <span
            key={tone}
            data-tone={tone}
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_CLASS[tone]}`}
          >
            {label}
          </span>
        ))}
      </div>
      <div className="grid gap-2.5 md:grid-cols-4">
        {KPIS.map(([key, label]) => (
          <div
            key={key}
            data-testid={`integration-kpi-${key}`}
            className="rounded-xl bg-neutral-50 p-3"
          >
            <b className="block text-lg text-neutral-900">{summary[key]}</b>
            <span className="text-xs text-neutral-600">{label}</span>
          </div>
        ))}
      </div>
      <p
        id="pusatToast"
        role="status"
        data-testid="integration-kpi-toast"
        className="rounded-xl bg-info-50 p-3 text-xs text-neutral-700"
      >
        {toast ?? (
          <>
            <b>💡 Tanpa Cron Latar Belakang:</b> {LAZY_REFRESH_NOTE}
          </>
        )}
      </p>
    </div>
  );
}
