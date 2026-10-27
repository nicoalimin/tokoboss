'use client';

import { useEffect, useState } from 'react';
import type { TokobossSkuMappingCardView } from '@tokoboss/contracts';
import { fetchSkuMappingOverview } from './sku-mapping-client';
import type { SkuMappingLang } from './sku-mapping-copy';

/**
 * SkuDrawer "Dijual di" data + copy (UTA-40 / US03, RFC 05 row 41a):
 * loads this SKU TokoBoss card from the sku-mappings overview
 * (`?variantId=`); null while loading, on failure, or when the variant is
 * not in the overview (the section then shows the static Story 01
 * mappings). Rows 41b/41c render it; the link opens Petakan Store SKU.
 */

export interface DrawerStoreSkusCopy {
  title: string;
  subtitle: string;
  manage: string;
  map: string;
  empty: string;
}

const COPY: Record<SkuMappingLang, DrawerStoreSkusCopy> = {
  id: {
    title: 'Dijual di',
    subtitle: 'Store SKU marketplace',
    manage: 'Atur pemetaan',
    map: 'Petakan',
    empty: 'Belum ada Store SKU.',
  },
  en: {
    title: 'Sold on',
    subtitle: 'Marketplace Store SKUs',
    manage: 'Manage mapping',
    map: 'Map',
    empty: 'No Store SKUs yet.',
  },
};

export function getDrawerStoreSkusCopy(
  lang: SkuMappingLang = 'id'
): DrawerStoreSkusCopy {
  return COPY[lang] ?? COPY.id;
}

/** `/w/<workspaceId>/produk/pemetaan?variantId=<id>` (row 40 page). */
export function skuMappingPageHref(workspaceId: string, variantId: string) {
  const w = encodeURIComponent(workspaceId);
  return `/w/${w}/produk/pemetaan?variantId=${encodeURIComponent(variantId)}`;
}

export function useDrawerStoreSkus(
  workspaceId: string,
  variantId: string
): TokobossSkuMappingCardView | null {
  const [card, setCard] = useState<TokobossSkuMappingCardView | null>(null);
  useEffect(() => {
    let live = true;
    setCard(null);
    fetchSkuMappingOverview(workspaceId, { variantId })
      .then((o) => {
        if (!live) return;
        setCard(o.items.find((i) => i.variantId === variantId) ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [workspaceId, variantId]);
  return card;
}
