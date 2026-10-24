import Link from 'next/link';
import type { IntegrationConnectionView } from '@tokoboss/contracts';
import {
  getIntegrationCopy,
  type IntegrationLang,
  type IntegrationStatusKey,
} from '@/lib/integration-copy';
import { getIntegrationConsentCopy } from '@/lib/integration-consent-copy';
import { groupConnectionsByProvider } from '@/lib/integration-views';
import { ProviderCard } from './ProviderCard';
import { StatusBadge } from './StatusBadge';

/**
 * Integration Center panel (US20 / RFC 04 task 108), mockup v2 screen 1:
 * title, Admin-only "+ Hubungkan toko" (else "Hanya Admin" note), legend,
 * a ProviderCard (107) per provider (102 grouping) and the capability note.
 * Presentational: page 109 fetches (101) and supplies the hrefs.
 */

export interface IntegrationCenterPanelProps {
  connections: readonly IntegrationConnectionView[];
  isAdmin: boolean;
  /** Connect wizard target; Admin connect links are hidden when absent. */
  connectHref?: string;
  /** Store detail base; each store row links to `${storeHrefBase}/${id}`. */
  storeHrefBase?: string;
  lang?: IntegrationLang;
}

const LEGEND: readonly IntegrationStatusKey[] = [
  'not_connected',
  'connected',
  'needs_reauth',
  'disconnected',
];

export function IntegrationCenterPanel({
  connections,
  isAdmin,
  connectHref,
  storeHrefBase,
  lang = 'id',
}: Readonly<IntegrationCenterPanelProps>) {
  const copy = getIntegrationCopy(lang);
  return (
    <div data-testid="integration-center" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-neutral-900">
            {copy.pageTitle}
          </h1>
          <p className="text-sm text-neutral-600">{copy.pageSubtitle}</p>
        </div>
        {isAdmin && connectHref ? (
          <Link
            href={connectHref}
            data-testid="integration-center-connect"
            className="inline-flex min-h-[44px] items-center rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white"
          >
            {copy.connectButton}
          </Link>
        ) : null}
        {isAdmin ? null : (
          <span
            data-testid="integration-center-admin-only"
            className="inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700"
          >
            <span aria-hidden="true">🔒&nbsp;</span>
            {copy.adminOnlyNote}
          </span>
        )}
      </div>
      <div
        data-testid="integration-center-legend"
        className="flex flex-wrap gap-2"
      >
        {LEGEND.map((status) => (
          <StatusBadge key={status} status={status} lang={lang} />
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {groupConnectionsByProvider(connections).map((g) => (
          <ProviderCard
            key={g.provider}
            provider={g.provider}
            connections={g.connections}
            isAdmin={isAdmin}
            connectHref={connectHref}
            storeHrefBase={storeHrefBase}
            lang={lang}
          />
        ))}
      </div>
      <p
        data-testid="integration-center-note"
        className="rounded-xl bg-neutral-50 p-3 text-xs text-neutral-700"
      >
        {getIntegrationConsentCopy(lang).capabilityNote}
      </p>
    </div>
  );
}
