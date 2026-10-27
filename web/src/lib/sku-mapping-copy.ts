/**
 * Petakan Store SKU copy, Bahasa Indonesia first (UTA-40 / US03, RFC 05
 * row 30a): page header, banner, KPI cards, filter chips and SKU TokoBoss
 * card, as in the approved mockup. Conflict, lifecycle, history and action
 * labels: sku-mapping-status-copy.ts (30b). Keys stay in sync per locale.
 */
import type { SkuMappingOverviewFilter } from '@tokoboss/contracts';

export type SkuMappingLang = 'id' | 'en';

export interface SkuMappingCopy {
  eyebrow: string;
  pageTitle: string;
  pageSubtitle: string;
  backLink: string;
  bannerTitle: string;
  bannerBody: string;
  kpiMapped: string;
  kpiMappedNote: string;
  kpiReview: string;
  kpiReviewNote: string;
  kpiUnmapped: string;
  kpiUnmappedNote: string;
  bulkMap: (n: number) => string;
  filters: Record<SkuMappingOverviewFilter, string>;
  skuHeader: (skuCode: string) => string;
  primarySource: string;
  primaryPill: string;
  needsReview: (n: number) => string;
  storeSku: (channel: string, store: string, sku: string) => string;
  pickStoreSku: string;
}

const id: SkuMappingCopy = {
  eyebrow: 'Sumber utama: SKU TokoBoss',
  pageTitle: 'Petakan Store SKU',
  pageSubtitle:
    'Satu SKU TokoBoss mengendalikan stok; Store SKU Shopee, TikTok Shop, dan Blibli mengikuti di bawahnya.',
  backLink: '← Produk & stok',
  bannerTitle: 'SKU TokoBoss adalah sumber utama',
  bannerBody:
    'Nama listing dan Store SKU boleh berbeda per marketplace. Stok, HPP, dan histori tetap mengikuti SKU TokoBoss yang dipetakan.',
  kpiMapped: 'Store SKU terpetakan',
  kpiMappedNote: 'ke SKU TokoBoss',
  kpiReview: 'Perlu ditinjau',
  kpiReviewNote: 'kecocokan ambigu',
  kpiUnmapped: 'Belum dipetakan',
  kpiUnmappedNote: 'Store SKU',
  bulkMap: (n) => `Petakan otomatis (${n} saran cocok)`,
  filters: {
    all: 'Semua',
    needs_review: 'Perlu ditinjau',
    unmapped_sku: 'Belum dipetakan',
    conflict: 'Konflik stok',
    issue: 'Bermasalah',
  },
  skuHeader: (skuCode) => `SKU TokoBoss · ${skuCode}`,
  primarySource: 'sumber stok utama',
  primaryPill: 'Utama',
  needsReview: (n) => `! ${n} perlu ditinjau`,
  storeSku: (channel, store, sku) => `${channel} · ${store} · Store SKU ${sku}`,
  pickStoreSku: 'Pilih Store SKU',
};

const en: SkuMappingCopy = {
  eyebrow: 'Primary source: TokoBoss SKU',
  pageTitle: 'Map Store SKUs',
  pageSubtitle:
    'One TokoBoss SKU controls stock; Shopee, TikTok Shop and Blibli Store SKUs follow beneath it.',
  backLink: '← Products & stock',
  bannerTitle: 'TokoBoss SKU is the primary source',
  bannerBody:
    'Listing names and Store SKUs may differ per marketplace. Stock, COGS and history always follow the mapped TokoBoss SKU.',
  kpiMapped: 'Store SKUs mapped',
  kpiMappedNote: 'to TokoBoss SKUs',
  kpiReview: 'Needs review',
  kpiReviewNote: 'ambiguous matches',
  kpiUnmapped: 'Not mapped',
  kpiUnmappedNote: 'Store SKUs',
  bulkMap: (n) => `Auto-map (${n} matching suggestions)`,
  filters: {
    all: 'All',
    needs_review: 'Needs review',
    unmapped_sku: 'Not mapped',
    conflict: 'Stock conflict',
    issue: 'Has issues',
  },
  skuHeader: (skuCode) => `TokoBoss SKU · ${skuCode}`,
  primarySource: 'primary stock source',
  primaryPill: 'Primary',
  needsReview: (n) => `! ${n} need review`,
  storeSku: (channel, store, sku) => `${channel} · ${store} · Store SKU ${sku}`,
  pickStoreSku: 'Choose Store SKU',
};

const COPIES: Record<SkuMappingLang, SkuMappingCopy> = { id, en };

export function getSkuMappingCopy(lang: SkuMappingLang = 'id'): SkuMappingCopy {
  return COPIES[lang] ?? COPIES.id;
}
