import Link from 'next/link';
import type { MarketplaceProviderWire } from '@tokoboss/contracts';
import {
  getIntegrationCopy,
  INTEGRATION_PROVIDER_NAMES,
  type IntegrationLang,
} from '@/lib/integration-copy';
import { AskAdminButton } from './AskAdminButton';
import { StatusBadge } from './StatusBadge';
import { StoreRow, type StoreRowConnection } from './StoreRow';

/**
 * Provider card (US20 / RFC 04 task 107), mockup v2 screen 1: logo + name,
 * store count, a StoreRow (106) per store, Admin-only "+ Toko lain". No
 * stores: "Belum ada toko" + hint + Belum terhubung badge, Admin "Hubungkan
 * {provider}", Manager / Staff Minta Admin (105). Parent supplies hrefs.
 */

export type ProviderCardConnection = StoreRowConnection & { id: string };

export interface ProviderCardProps {
  provider: MarketplaceProviderWire;
  connections: readonly ProviderCardConnection[];
  isAdmin: boolean;
  /** Connect wizard target; the Admin connect link is hidden when absent. */
  connectHref?: string;
  /** Store detail base; each row links to `${storeHrefBase}/${id}`. */
  storeHrefBase?: string;
  lang?: IntegrationLang;
}

const PRIMARY = 'border-transparent bg-primary-500 text-white';
const SECONDARY = 'border-neutral-300 bg-white text-neutral-800';

export function ProviderCard({
  provider,
  connections,
  isAdmin,
  connectHref,
  storeHrefBase,
  lang = 'id',
}: Readonly<ProviderCardProps>) {
  const copy = getIntegrationCopy(lang);
  const name = INTEGRATION_PROVIDER_NAMES[provider];
  const count = connections.length;
  const empty = count === 0;
  return (
    <section
      data-testid="provider-card"
      data-provider={provider}
      className="rounded-2xl border border-neutral-200 bg-white p-4"
    >
      <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
        <span
          aria-hidden="true"
          className="grid h-8 w-8 place-items-center rounded-lg bg-neutral-100 text-sm font-extrabold text-neutral-800"
        >
          {name.charAt(0)}
        </span>
        {name}
      </h2>
      <p className="text-xs text-neutral-600">{copy.storeCount(count)}</p>
      {empty ? (
        <div
          data-testid="provider-card-empty"
          className="mt-2 flex items-center gap-3 border-t border-neutral-200 py-3"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-neutral-900">
              {copy.emptyStores}
            </p>
            <p className="text-xs text-neutral-600">{copy.emptyStoresHint}</p>
          </div>
          <StatusBadge status="not_connected" lang={lang} />
        </div>
      ) : (
        connections.map((c) => (
          <StoreRow
            key={c.id}
            connection={c}
            isAdmin={isAdmin}
            actionHref={storeHrefBase && `${storeHrefBase}/${c.id}`}
            lang={lang}
          />
        ))
      )}
      {isAdmin && connectHref ? (
        <Link
          href={connectHref}
          data-testid="provider-card-connect"
          className={`mt-3 inline-flex min-h-[44px] items-center rounded-lg border px-3 py-2 text-sm font-semibold ${empty ? PRIMARY : SECONDARY}`}
        >
          {empty ? copy.connectProvider(name) : copy.addStore}
        </Link>
      ) : null}
      {!isAdmin && empty ? (
        <AskAdminButton provider={name} lang={lang} className="mt-3" />
      ) : null}
    </section>
  );
}
