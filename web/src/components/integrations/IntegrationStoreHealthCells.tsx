import type { StoreHealthRowView } from '@/lib/integration-management-views';
import { formatWibDateTime } from '@/lib/integration-activity-views';
import { INTEGRATION_PROVIDER_NAMES } from '@/lib/integration-copy';

/**
 * Store table cells (UTA-38 / US18, RFC 07 row 31a), mockup `#storeTable`:
 * identity (shop_ext_id · warehouse), health pill + ~30-day token label, a
 * capability checkbox, WIB last activity. Row 31b owns locking & actions.
 */

export type StoreCapabilityKey = 'orderImportEnabled' | 'inventorySyncEnabled';

const TONE_CLASS: Record<StoreHealthRowView['health']['tone'], string> = {
  ok: 'bg-success-50 text-success-700',
  sky: 'bg-info-50 text-info-700',
  warn: 'bg-warning-50 text-warning-700',
  bad: 'bg-error-50 text-error-700',
};

/** Latest order import / stock push, `28 Okt 2026 · 18:12 WIB`, else `—`. */
export function formatLastActivity(row: StoreHealthRowView): string {
  const { lastOrderImportAt: a, lastStockPushAt: b } = row.metrics;
  const latest = a && b ? (a > b ? a : b) : (a ?? b);
  return latest ? formatWibDateTime(new Date(latest)) : '—';
}

export function StoreIdentityCell({
  row,
}: Readonly<{ row: StoreHealthRowView }>) {
  const { connection: c, metrics } = row;
  return (
    <td>
      <b>{c.storeName ?? c.providerStoreId}</b> ·{' '}
      {INTEGRATION_PROVIDER_NAMES[c.provider]}
      <br />
      <small className="text-neutral-600">
        ID <code>{c.providerStoreId}</code> ·{' '}
        {metrics.linkedWarehouseCodes.join(', ') || '—'}
      </small>
    </td>
  );
}

export function StoreHealthCell({
  health,
}: Readonly<Pick<StoreHealthRowView, 'health'>>) {
  return (
    <td>
      <span
        data-tone={health.tone}
        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_CLASS[health.tone]}`}
      >
        {health.label}
      </span>
      {health.tokenExpiryLabel ? (
        <small className="block text-neutral-600">
          {health.tokenExpiryLabel}
        </small>
      ) : null}
    </td>
  );
}

export interface StoreCapabilityCellProps {
  row: StoreHealthRowView;
  capability: StoreCapabilityKey;
  locked: boolean;
  onToggle?: (id: string, key: StoreCapabilityKey, enabled: boolean) => void;
}

export function StoreCapabilityCell({
  row,
  capability,
  locked,
  onToggle,
}: Readonly<StoreCapabilityCellProps>) {
  const { id, [capability]: on } = row.connection;
  return (
    <td>
      <label className="inline-flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          data-testid={`store-health-${capability}`}
          checked={on}
          disabled={locked}
          onChange={(e) => onToggle?.(id, capability, e.target.checked)}
        />
        <span>{on ? 'Aktif' : 'Dijeda'}</span>
      </label>
    </td>
  );
}
