import type { IntegrationConnectionView } from '@tokoboss/contracts';
import {
  getIntegrationCopy,
  INTEGRATION_PROVIDER_NAMES,
  type IntegrationLang,
} from '@/lib/integration-copy';
import { getIntegrationResultCopy } from '@/lib/integration-result-copy';

/**
 * Connect success details (US20 / RFC 04 task 115b, CoS split of row 115),
 * mockup v2 screen 3 cards: store table (Penyedia, Nama toko, ID toko,
 * Dihubungkan oleh · WIB time) and Izin diberikan. Store name falls back to
 * the provider store ID; a missing connector or time shows "—" / no time.
 * ConnectResult (115c) adds heading, import KPIs (sinkron stok Mati), next
 * steps and the Store SKU note. No fetch, no state.
 */

export type ConnectResultConnection = Pick<
  IntegrationConnectionView,
  'provider' | 'providerStoreId' | 'storeName' | 'connectedBy' | 'connectedAt'
>;

export interface ConnectResultDetailsProps {
  connection: ConnectResultConnection;
  lang?: IntegrationLang;
}

const TZ = { timeZone: 'Asia/Jakarta' } as const;
const TIME = new Intl.DateTimeFormat('en-GB', {
  ...TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const DAY = { ...TZ, day: 'numeric', month: 'short', year: 'numeric' } as const;

/** `19 Okt 2026 17:10 WIB`, or null when missing or invalid. */
export function formatConnectedAt(iso: string | null, lang: IntegrationLang) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const locale = lang === 'en' ? 'en-GB' : 'id-ID';
  const day = new Intl.DateTimeFormat(locale, DAY).format(date);
  return `${day} ${TIME.format(date)} WIB`;
}

const CARD = 'rounded-xl border border-neutral-200 bg-white p-4';

export function ConnectResultDetails({
  connection,
  lang = 'id',
}: Readonly<ConnectResultDetailsProps>) {
  const copy = getIntegrationResultCopy(lang);
  const { providerStoreId } = connection;
  const who = connection.connectedBy ?? '—';
  const at = formatConnectedAt(connection.connectedAt, lang);
  const rows: [string, string][] = [
    [copy.providerLabel, INTEGRATION_PROVIDER_NAMES[connection.provider]],
    [copy.storeNameLabel, connection.storeName || providerStoreId],
    [getIntegrationCopy(lang).storeIdLabel, providerStoreId],
    [copy.connectedByLabel, at ? copy.connectedBy(who, at) : who],
  ];
  return (
    <div
      data-testid="connect-result-details"
      className="grid gap-3 md:grid-cols-2"
    >
      <dl className={`${CARD} grid grid-cols-2 gap-2 text-sm`}>
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-neutral-600">{label}</dt>
            <dd className="font-semibold text-neutral-900">{value}</dd>
          </div>
        ))}
      </dl>
      <div className={CARD}>
        <h3 className="text-sm font-bold text-neutral-900">
          {copy.grantedHeading}
        </h3>
        <ul
          data-testid="connect-result-scopes"
          className="mt-2 space-y-1 text-sm text-neutral-800"
        >
          {copy.grantedScopes.map((scope) => (
            <li key={scope}>✅ {scope}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
