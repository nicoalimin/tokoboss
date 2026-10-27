import Link from 'next/link';
import type {
  StagedListingCandidateView,
  SubordinateStoreSkuView,
} from '@tokoboss/contracts';
import type { ChannelMappingView } from '@/lib/catalog-client';
import { INTEGRATION_PROVIDER_NAMES } from '@/lib/integration-copy';
import { getSkuMappingCopy, type SkuMappingLang } from '@/lib/sku-mapping-copy';
import { getSkuMappingStatusCopy } from '@/lib/sku-mapping-status-copy';
import { getDrawerStoreSkusCopy } from '@/lib/use-drawer-store-skus';

/**
 * SkuDrawer "Dijual di" rows (UTA-40 / US03, RFC 05 row 41b): mapped Store
 * SKU (Mengikuti / Konflik stok / lifecycle pills), static Story 01
 * fallback, unmapped suggestion (Belum dipetakan + Petakan). 41c renders.
 */

const PILL = 'rounded-full px-2 py-0.5 text-xs font-semibold';
const ROW = 'flex flex-wrap items-center gap-2 py-2 text-sm';
const LINK = 'text-xs font-semibold text-primary-700 underline';
const NAMES: Record<string, string> = INTEGRATION_PROVIDER_NAMES;
const name = (c: string) => NAMES[c] ?? c;

type Lang = { lang?: SkuMappingLang };

export function DrawerMappedRow({
  m,
  lang = 'id',
}: Readonly<{ m: SubordinateStoreSkuView } & Lang>) {
  const copy = getSkuMappingCopy(lang);
  const status = getSkuMappingStatusCopy(lang);
  const store = m.storeDisplayName ?? m.shopExtId;
  const sku = m.storeSkuText ?? m.platformSkuId;
  const conflict = m.hasStockConflict && m.providerStock !== null;
  return (
    <li data-testid="drawer-mapping-row" className={ROW}>
      <span className="font-semibold text-neutral-900">
        {copy.storeSku(name(m.channel), store, sku)}
      </span>
      {conflict ? (
        <span
          data-testid="drawer-mapping-conflict"
          className={`${PILL} bg-red-50 text-red-700`}
        >
          {status.conflict(m.providerStock ?? 0, m.tokobossStockQty)}
        </span>
      ) : (
        <span className={`${PILL} bg-primary-50 text-primary-700`}>
          {status.following}
        </span>
      )}
      {m.lifecycleIssue ? (
        <span className={`${PILL} bg-amber-50 text-amber-800`}>
          {status.lifecycle[m.lifecycleIssue]}
        </span>
      ) : null}
    </li>
  );
}

export function DrawerLegacyRow({
  m,
  lang = 'id',
}: Readonly<{ m: ChannelMappingView } & Lang>) {
  const copy = getSkuMappingCopy(lang);
  return (
    <li data-testid="drawer-mapping-row" className={ROW}>
      <span className="font-semibold text-neutral-900">
        {copy.storeSku(name(m.channel), m.shopExtId, m.platformSkuId)}
      </span>
      {m.listingName ? (
        <span className="text-neutral-600">{m.listingName}</span>
      ) : null}
    </li>
  );
}

export function DrawerSuggestionRow({
  s,
  href,
  lang = 'id',
}: Readonly<{ s: StagedListingCandidateView; href: string } & Lang>) {
  const copy = getSkuMappingCopy(lang);
  const store = s.storeDisplayName ?? s.connectionId;
  const sku = s.storeSkuText ?? s.platformSkuId;
  return (
    <li data-testid="drawer-mapping-suggestion" className={ROW}>
      <span className="text-neutral-700">
        {copy.storeSku(name(s.channel), store, sku)}
      </span>
      <span className={`${PILL} bg-neutral-100 text-neutral-700`}>
        {copy.filters.unmapped_sku}
      </span>
      <Link href={href} className={LINK}>
        {getDrawerStoreSkusCopy(lang).map}
      </Link>
    </li>
  );
}
