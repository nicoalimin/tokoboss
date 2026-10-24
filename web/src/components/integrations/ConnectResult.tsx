import Link from 'next/link';
import type { IntegrationImportSummary } from '@tokoboss/contracts';
import type { IntegrationLang } from '@/lib/integration-copy';
import { getIntegrationResultCopy } from '@/lib/integration-result-copy';
import {
  ConnectResultDetails,
  type ConnectResultConnection,
} from './ConnectResultDetails';
import { StatusBadge } from './StatusBadge';

/**
 * Connect success screen (US20 / RFC 04 task 115c, last slice of row 115),
 * mockup v2 screen 3: Toko terhubung + Terhubung pill, intro,
 * ConnectResultDetails (115b), four import KPIs (counts optional, "—" until
 * the import summary exists; sinkron stok is always Mati), numbered
 * Langkah berikutnya and the Store SKU note. A step without a target is a
 * disabled button; step 3 (sync, Story 04) is always disabled.
 */

export type ConnectResultCounts = Pick<
  IntegrationImportSummary,
  'listingsImported' | 'storeSkusMapped' | 'ordersImported'
>;

export interface ConnectResultProps {
  connection: ConnectResultConnection;
  counts?: ConnectResultCounts | null;
  mapHref?: string;
  warehouseHref?: string;
  lang?: IntegrationLang;
}

const CARD = 'rounded-xl border border-neutral-200 bg-white p-4';
const BTN =
  'inline-flex min-h-[44px] items-center rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50';
const PRIMARY = `${BTN} bg-primary-500 text-white hover:bg-primary-600`;
const SECONDARY = `${BTN} border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50`;

export function ConnectResult({
  connection,
  counts,
  mapHref,
  warehouseHref,
  lang = 'id',
}: Readonly<ConnectResultProps>) {
  const copy = getIntegrationResultCopy(lang);
  const n = (v?: number) => (v === undefined ? '—' : String(v));
  const kpis: [string, string][] = [
    [n(counts?.listingsImported), copy.listingsImported],
    [n(counts?.storeSkusMapped), copy.storeSkusMapped],
    [n(counts?.ordersImported), copy.ordersImported],
    [copy.syncOff, copy.syncLabel],
  ];
  const hrefs = [mapHref, warehouseHref, undefined];
  return (
    <div data-testid="connect-result" className="flex flex-col gap-4">
      <h2 className="flex items-center gap-2 text-lg font-bold text-neutral-900">
        {copy.heading}
        <StatusBadge status="connected" lang={lang} />
      </h2>
      <p className="text-sm text-neutral-600">{copy.intro}</p>
      <ConnectResultDetails connection={connection} lang={lang} />
      <div
        data-testid="connect-result-kpis"
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
      >
        {kpis.map(([value, label]) => (
          <div key={label} className={CARD}>
            <p className="text-xl font-bold text-neutral-900">{value}</p>
            <p className="text-xs text-neutral-600">{label}</p>
          </div>
        ))}
      </div>
      <h2 className="text-base font-bold text-neutral-900">
        {copy.nextStepsTitle}
      </h2>
      <div data-testid="connect-result-steps" className="flex flex-wrap gap-2">
        {copy.nextSteps.map((step, i) => {
          const href = hrefs[i];
          const cls = i === 0 ? PRIMARY : SECONDARY;
          const label = `${i + 1} · ${step}`;
          return href ? (
            <Link key={step} href={href} className={cls}>
              {label}
            </Link>
          ) : (
            <button key={step} type="button" disabled className={cls}>
              {label}
            </button>
          );
        })}
      </div>
      <p className="rounded-xl bg-neutral-100 px-3 py-2 text-xs text-neutral-700">
        {copy.storeSkuNote}
      </p>
    </div>
  );
}
