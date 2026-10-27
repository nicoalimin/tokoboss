'use client';

import Link from 'next/link';
import type { ChannelMappingView } from '@/lib/catalog-client';
import type { SkuMappingLang } from '@/lib/sku-mapping-copy';
import {
  getDrawerStoreSkusCopy,
  skuMappingPageHref,
  useDrawerStoreSkus,
} from '@/lib/use-drawer-store-skus';
import {
  DrawerLegacyRow,
  DrawerMappedRow,
  DrawerSuggestionRow,
} from './DrawerStoreSkuRows';

/**
 * SkuDrawer "Dijual di / Store SKU marketplace" section (UTA-40 / US03,
 * RFC 05 row 41c; RFC file name): this SKU TokoBoss card from the 41a hook
 * (overview `?variantId=`) renders mapped Store SKUs and unmapped
 * suggestions (41b rows) plus an "Atur pemetaan" link to the Petakan Store
 * SKU page; until it loads, or if it fails, the static Story 01
 * `mappings` from the variant payload render. Row 42 mounts it.
 */

export interface DrawerStoreSkusSectionProps {
  workspaceId: string;
  variantId: string;
  mappings: ChannelMappingView[];
  lang?: SkuMappingLang;
}

export function DrawerStoreSkusSection({
  workspaceId,
  variantId,
  mappings,
  lang = 'id',
}: Readonly<DrawerStoreSkusSectionProps>) {
  const t = getDrawerStoreSkusCopy(lang);
  const card = useDrawerStoreSkus(workspaceId, variantId);
  const href = skuMappingPageHref(workspaceId, variantId);
  const rows = card
    ? [
        ...card.mappings.map((m) => (
          <DrawerMappedRow key={m.mappingId} m={m} lang={lang} />
        )),
        ...card.suggestions.map((s) => (
          <DrawerSuggestionRow
            key={s.listingId}
            s={s}
            href={href}
            lang={lang}
          />
        )),
      ]
    : mappings.map((m) => <DrawerLegacyRow key={m.id} m={m} lang={lang} />);
  return (
    <section
      aria-labelledby="drawer-mappings-title"
      data-testid="drawer-store-skus"
      className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3
            id="drawer-mappings-title"
            className="text-base font-semibold text-neutral-900"
          >
            {t.title}
          </h3>
          <p className="text-xs text-neutral-500">{t.subtitle}</p>
        </div>
        <Link
          href={href}
          data-testid="drawer-sku-mapping-link"
          className="min-h-[44px] text-sm font-semibold text-primary-700 underline"
        >
          {t.manage}
        </Link>
      </div>
      {rows.length === 0 ? (
        <p
          data-testid="drawer-mappings-empty"
          className="mt-2 text-sm text-neutral-500"
        >
          {t.empty}
        </p>
      ) : (
        <ul
          data-testid="drawer-mappings"
          className="mt-2 divide-y divide-neutral-100"
        >
          {rows}
        </ul>
      )}
    </section>
  );
}
