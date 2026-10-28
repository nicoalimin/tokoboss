'use client';

import { useState } from 'react';
import type { StagedListingCandidateView } from '@tokoboss/contracts';
import type { SkuMappingsState } from './use-sku-mappings';

/**
 * Review + remap flow for the Petakan Store SKU panel (UTA-40 / US03, RFC 05
 * row 39a). A 409 SKU_MAPPING_ALREADY_ASSIGNED reopens the row 37 dialog in
 * remap mode and reloads, so `confirm` resends with allowRemap + the owner
 * mapping version: 409 `details.currentVersion` (UTA-958), else the loaded
 * overview owner (neither: no options, 409 message stays).
 */

export interface SkuMappingReview {
  candidate: StagedListingCandidateView | null;
  options: { variantId: string; skuCode: string; title: string }[];
  defaultVariantId?: string;
  currentSkuCode?: string | null;
  error: string | null;
  open: (candidate: StagedListingCandidateView, variantId: string) => void;
  pick: (variantId: string, listingId: string) => void;
  confirm: (variantId: string) => void;
  cancel: () => void;
}

type Target = {
  candidate: StagedListingCandidateView;
  variantId: string;
  dialog: boolean;
};

export function useSkuMappingReview(s: SkuMappingsState): SkuMappingReview {
  const [t, setT] = useState<Target | null>(null);
  const items = s.overview?.items ?? [];
  const c = t?.candidate;
  const conflict = !!t && s.error?.errorCode === 'SKU_MAPPING_ALREADY_ASSIGNED';
  const details = s.error?.details as {
    currentSkuCode?: string;
    currentVersion?: number;
  } | null;
  const version = details?.currentVersion;
  const owner =
    typeof version === 'number'
      ? { version }
      : items
          .flatMap((i) => i.mappings)
          .find(
            (m) =>
              m.connectionId === c?.connectionId &&
              m.platformSkuId === c?.platformSkuId
          );
  const ids = new Set([t?.variantId, ...(c?.suggestedVariantIds ?? [])]);
  const options = items
    .filter((i) => ids.has(i.variantId) && (!conflict || owner))
    .map((i) => ({
      variantId: i.variantId,
      skuCode: i.skuCode,
      title: [i.productName, i.variantName].filter(Boolean).join(' · '),
    }));

  async function write(next: Target, remap: typeof owner) {
    setT(next);
    const res = await s.map({
      variantId: next.variantId,
      listingId: next.candidate.listingId,
      source: 'manual',
      ...(remap ? { allowRemap: true, expectedVersion: remap.version } : {}),
    });
    if (res) setT(null);
    else s.retry();
  }

  return {
    candidate: t && (t.dialog || conflict) ? t.candidate : null,
    options,
    defaultVariantId: t?.variantId,
    currentSkuCode: conflict ? (details?.currentSkuCode ?? null) : undefined,
    error: conflict && owner ? null : (s.error?.message ?? null),
    open: (candidate, variantId) => {
      s.clearError();
      setT({ candidate, variantId, dialog: true });
    },
    pick: (variantId, listingId) => {
      const candidate = [
        ...items.flatMap((i) => i.suggestions),
        ...(s.overview?.unassignedListings ?? []),
      ].find((p) => p.listingId === listingId);
      if (candidate)
        void write({ candidate, variantId, dialog: false }, undefined);
    },
    confirm: (variantId) => {
      if (t)
        void write(
          { ...t, variantId, dialog: true },
          conflict ? owner : undefined
        );
    },
    cancel: () => {
      s.clearError();
      setT(null);
    },
  };
}
