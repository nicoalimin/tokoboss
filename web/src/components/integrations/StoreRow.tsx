import Link from 'next/link';
import type { IntegrationConnectionView } from '@tokoboss/contracts';
import {
  getIntegrationCopy,
  INTEGRATION_PROVIDER_NAMES,
  type IntegrationLang,
} from '@/lib/integration-copy';
import { AskAdminButton } from './AskAdminButton';
import { StatusBadge } from './StatusBadge';

/**
 * Store row (US20 / RFC 04 task 106): mockup v2 screen 1 — store name,
 * provider store ID, last check (WIB), the status badge (104) and the
 * Admin-only action: Otorisasi ulang (needs reauth) or Lihat & hubungkan
 * lagi (disconnected). Manager / Staff get Minta Admin (105) instead.
 * Presentational: no fetch, no state; the parent supplies `actionHref`.
 */

export type StoreRowConnection = Pick<
  IntegrationConnectionView,
  'provider' | 'providerStoreId' | 'storeName' | 'status' | 'lastCheckedAt'
>;

export interface StoreRowProps {
  connection: StoreRowConnection;
  isAdmin: boolean;
  /** Admin action target (store detail); the link is hidden when absent. */
  actionHref?: string;
  lang?: IntegrationLang;
}

const TIME = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Jakarta',
});

/** `17:02 WIB`, or null when the store was never checked. */
export function formatLastChecked(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : `${TIME.format(date)} WIB`;
}

export function StoreRow({
  connection,
  isAdmin,
  actionHref,
  lang = 'id',
}: Readonly<StoreRowProps>) {
  const copy = getIntegrationCopy(lang);
  const { status, providerStoreId } = connection;
  const checked = formatLastChecked(connection.lastCheckedAt);
  const action =
    status === 'needs_reauth'
      ? copy.reauthorize
      : status === 'disconnected'
        ? copy.viewAndReconnect
        : null;
  return (
    <div
      data-testid="store-row"
      data-status={status}
      className="flex flex-wrap items-center gap-3 border-t border-neutral-200 py-3"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-neutral-900">
          {connection.storeName ?? providerStoreId}
        </p>
        <p className="text-xs text-neutral-600">
          {copy.storeIdLabel} {providerStoreId}
          {checked ? ` · ${copy.lastChecked(checked)}` : null}
        </p>
      </div>
      <StatusBadge status={status} lang={lang} />
      {action && isAdmin && actionHref ? (
        <Link
          href={actionHref}
          data-testid="store-row-action"
          className="inline-flex min-h-[44px] items-center rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
        >
          {action}
        </Link>
      ) : null}
      {action && !isAdmin ? (
        <AskAdminButton
          provider={INTEGRATION_PROVIDER_NAMES[connection.provider]}
          lang={lang}
        />
      ) : null}
    </div>
  );
}
