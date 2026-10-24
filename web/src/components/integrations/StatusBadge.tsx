import type {
  IntegrationLang,
  IntegrationStatusKey,
} from '@/lib/integration-copy';
import {
  integrationStatusBadge,
  type IntegrationBadgeTone,
} from '@/lib/integration-views';

/**
 * Integration status badge (US20 / RFC 04 task 104): one of the four
 * statuses — Belum terhubung, Terhubung, Perlu otorisasi ulang, Terputus —
 * as the mockup v2 pill (plain, ok, warn, bad). Label and tone come from
 * `integrationStatusBadge` (row 102); the text is always shown, so status
 * is never color-only. Presentational: no fetch, no state, no actions.
 */

const TONE_CLASS: Record<IntegrationBadgeTone, string> = {
  neutral: 'bg-neutral-100 text-neutral-700',
  ok: 'bg-success-50 text-success-700',
  warn: 'bg-warning-50 text-warning-700',
  bad: 'bg-error-50 text-error-700',
};

export interface StatusBadgeProps {
  status: IntegrationStatusKey;
  lang?: IntegrationLang;
  /** Extra layout classes from the parent (e.g. `ml-auto`). */
  className?: string;
}

export function StatusBadge({
  status,
  lang = 'id',
  className = '',
}: Readonly<StatusBadgeProps>) {
  const badge = integrationStatusBadge(status, lang);
  return (
    <span
      data-testid="integration-status-badge"
      data-status={badge.status}
      data-tone={badge.tone}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_CLASS[badge.tone]} ${className}`.trim()}
    >
      {badge.label}
    </span>
  );
}
