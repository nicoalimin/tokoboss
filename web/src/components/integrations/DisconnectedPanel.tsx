import Link from 'next/link';
import type { IntegrationConnectionView } from '@tokoboss/contracts';
import {
  INTEGRATION_PROVIDER_NAMES,
  type IntegrationLang,
} from '@/lib/integration-copy';
import { getIntegrationDisconnectedCopy } from '@/lib/integration-disconnected-copy';
import { AskAdminButton } from './AskAdminButton';
import { formatConnectedAt } from './ConnectResultDetails';
import { DisconnectedImpact } from './DisconnectedImpact';
import { StatusBadge } from './StatusBadge';

/**
 * Disconnected (Terputus) panel (US20 / RFC 04 task 117c, last slice of row
 * 117), mockup v2 screen 5: store name · provider + Terputus pill, the
 * source line with the detected time (WIB), DisconnectedImpact (117b) and
 * the actions. Admins get Hubungkan lagi (link) and Hapus koneksi (the
 * parent opens the confirm dialog); Manager / Staff get Minta Admin. An
 * Admin action without a target is hidden. No fetch, no state.
 */

export type DisconnectedPanelConnection = Pick<
  IntegrationConnectionView,
  | 'provider'
  | 'providerStoreId'
  | 'storeName'
  | 'disconnectSource'
  | 'disconnectedAt'
>;

export interface DisconnectedPanelProps {
  connection: DisconnectedPanelConnection;
  isAdmin: boolean;
  mappingCount?: number;
  /** Admin Hubungkan lagi target (connect flow); hidden when absent. */
  reconnectHref?: string;
  /** Admin Hapus koneksi (opens the confirm dialog); hidden when absent. */
  onRemove?: () => void;
  lang?: IntegrationLang;
}

const BTN =
  'inline-flex min-h-[44px] items-center rounded-lg px-4 py-2 text-sm font-semibold';
const PRIMARY = `${BTN} bg-primary-500 text-white hover:bg-primary-600`;
const SECONDARY = `${BTN} border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50`;

export function DisconnectedPanel({
  connection,
  isAdmin,
  mappingCount,
  reconnectHref,
  onRemove,
  lang = 'id',
}: Readonly<DisconnectedPanelProps>) {
  const copy = getIntegrationDisconnectedCopy(lang);
  const source = connection.disconnectSource;
  const provider = INTEGRATION_PROVIDER_NAMES[connection.provider];
  const cause = source ? copy.source[source] : copy.sourceUnknown;
  const at = formatConnectedAt(connection.disconnectedAt, lang);
  return (
    <div data-testid="disconnected-panel" className="flex flex-col gap-4">
      <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold text-neutral-900">
        {connection.storeName || connection.providerStoreId} · {provider}
        <StatusBadge status="disconnected" lang={lang} />
      </h2>
      <p data-testid="disconnected-source" className="text-sm text-neutral-600">
        {at ? `${cause} · ${copy.detected(at)}.` : `${cause}.`}
      </p>
      <DisconnectedImpact
        source={source}
        mappingCount={mappingCount}
        lang={lang}
      />
      <div data-testid="disconnected-actions" className="flex flex-wrap gap-2">
        {isAdmin && reconnectHref ? (
          <Link href={reconnectHref} className={PRIMARY}>
            {copy.reconnect}
          </Link>
        ) : null}
        {isAdmin && onRemove ? (
          <button type="button" onClick={onRemove} className={SECONDARY}>
            {copy.remove}
          </button>
        ) : null}
        {isAdmin ? null : <AskAdminButton provider={provider} lang={lang} />}
      </div>
    </div>
  );
}
