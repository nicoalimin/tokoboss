/**
 * Ambiguous match / remap dialog copy, Bahasa Indonesia first (UTA-40 /
 * US03, RFC 05 row 37a, CoS split of row 37). Review: one Store SKU matches
 * several SKU TokoBoss, the seller picks one. Remap: a 409
 * SKU_MAPPING_ALREADY_ASSIGNED, the seller confirms moving the Store SKU.
 * Used by AmbiguousMatchDialog (37b). Keys stay in sync per locale.
 */
import type { SkuMappingLang } from './sku-mapping-copy';

export interface SkuMappingDialogCopy {
  reviewTitle: string;
  reviewBody: (n: number) => string;
  remapTitle: string;
  /** `current` is the SKU TokoBoss it is mapped to now (or `otherSku`). */
  remapBody: (current: string, target: string) => string;
  otherSku: string;
  storeSide: string;
  skuSide: string;
  stock: (n: number) => string;
  noOptions: string;
  confirmMap: string;
  confirmRemap: string;
  busy: string;
  cancel: string;
}

const id: SkuMappingDialogCopy = {
  reviewTitle: 'Tinjau kecocokan ambigu',
  reviewBody: (n) =>
    `Store SKU ini cocok dengan ${n} SKU TokoBoss. Pilih SKU TokoBoss yang benar.`,
  remapTitle: 'Pindahkan pemetaan Store SKU?',
  remapBody: (current, target) =>
    `Store SKU ini sudah dipetakan ke SKU TokoBoss ${current}. Pindahkan ke ${target}? Stok toko akan mengikuti SKU TokoBoss baru.`,
  otherSku: 'lain',
  storeSide: 'Store SKU',
  skuSide: 'SKU TokoBoss',
  stock: (n) => `Stok toko: ${n}`,
  noOptions:
    'Tidak ada SKU TokoBoss aktif yang cocok. Pilih Store SKU dari dropdown.',
  confirmMap: 'Petakan',
  confirmRemap: 'Pindahkan',
  busy: 'Menyimpan...',
  cancel: 'Batal',
};

const en: SkuMappingDialogCopy = {
  reviewTitle: 'Review ambiguous match',
  reviewBody: (n) =>
    `This Store SKU matches ${n} TokoBoss SKUs. Choose the right TokoBoss SKU.`,
  remapTitle: 'Move this Store SKU mapping?',
  remapBody: (current, target) =>
    `This Store SKU is already mapped to TokoBoss SKU ${current}. Move it to ${target}? Store stock will follow the new TokoBoss SKU.`,
  otherSku: 'another',
  storeSide: 'Store SKU',
  skuSide: 'TokoBoss SKU',
  stock: (n) => `Store stock: ${n}`,
  noOptions:
    'No active TokoBoss SKU matches. Choose a Store SKU from the dropdown.',
  confirmMap: 'Map',
  confirmRemap: 'Move',
  busy: 'Saving...',
  cancel: 'Cancel',
};

const COPIES: Record<SkuMappingLang, SkuMappingDialogCopy> = { id, en };

export function getSkuMappingDialogCopy(
  lang: SkuMappingLang = 'id'
): SkuMappingDialogCopy {
  return COPIES[lang] ?? COPIES.id;
}
