/**
 * Stock Opname review-screen copy, Bahasa Indonesia first (US12 / RFC 03 task
 * 41c): variance table, Rp value (Manager/Admin only), variance reasons and
 * D4 flags. Uncounted lines are excluded, never called zero. Staff see
 * quantities only; the panel hides the value strings for them.
 */
import type {
  StockCountFlagReasonWire,
  StockCountVarianceReasonCodeWire,
} from '@tokoboss/contracts';
import type { StockCountLang } from './stock-count-copy';

export interface StockCountReviewCopy {
  reviewTitle: string;
  colSystem: string;
  colCounted: string;
  colVariance: string;
  colValue: string;
  matched: string;
  excludedNote: (lines: number) => string;
  totalValue: string;
  noHpp: string;
  reasonLabel: string;
  reasonPlaceholder: string;
  reasons: Record<StockCountVarianceReasonCodeWire, string>;
  noteLabel: string;
  noteRequired: string;
  flags: Record<StockCountFlagReasonWire, string>;
  verifyTick: string;
  reasonMissing: string;
}

const id: StockCountReviewCopy = {
  reviewTitle: 'Tinjau selisih',
  colSystem: 'Stok sistem',
  colCounted: 'Dihitung',
  colVariance: 'Selisih',
  colValue: 'Nilai (Rp)',
  matched: 'Cocok',
  excludedNote: (lines) => `${lines} SKU belum dihitung dan tidak diposting.`,
  totalValue: 'Total nilai selisih',
  noHpp: 'HPP belum diisi',
  reasonLabel: 'Alasan selisih',
  reasonPlaceholder: 'Pilih alasan',
  reasons: {
    damaged_expired: 'Rusak/kedaluwarsa',
    lost: 'Hilang',
    prior_input_error: 'Salah input sebelumnya',
    unrecorded_receipt: 'Penerimaan belum dicatat',
    other: 'Lainnya',
  },
  noteLabel: 'Catatan',
  noteRequired: 'Catatan wajib diisi untuk alasan Lainnya.',
  flags: {
    large_negative: 'Selisih negatif besar (≥ 50% stok)',
    explicit_zero: 'Dihitung 0 padahal stok sistem ada',
    negative_result: 'Stok hasil menjadi negatif',
  },
  verifyTick: 'Sudah diverifikasi ulang',
  reasonMissing: 'Setiap baris yang berselisih perlu alasan.',
};

const en: StockCountReviewCopy = {
  reviewTitle: 'Review variances',
  colSystem: 'System stock',
  colCounted: 'Counted',
  colVariance: 'Variance',
  colValue: 'Value (Rp)',
  matched: 'Matched',
  excludedNote: (lines) => `${lines} SKUs not counted and won't be posted.`,
  totalValue: 'Total variance value',
  noHpp: 'HPP not set',
  reasonLabel: 'Variance reason',
  reasonPlaceholder: 'Choose a reason',
  reasons: {
    damaged_expired: 'Damaged/expired',
    lost: 'Lost',
    prior_input_error: 'Earlier input error',
    unrecorded_receipt: 'Unrecorded receipt',
    other: 'Other',
  },
  noteLabel: 'Note',
  noteRequired: 'A note is required for Other.',
  flags: {
    large_negative: 'Large negative variance (≥ 50% of stock)',
    explicit_zero: 'Counted 0 while system stock exists',
    negative_result: 'Resulting stock goes negative',
  },
  verifyTick: 'Re-verified',
  reasonMissing: 'Every line with a variance needs a reason.',
};

const COPIES: Record<StockCountLang, StockCountReviewCopy> = { id, en };

export function getStockCountReviewCopy(
  lang: StockCountLang = 'id'
): StockCountReviewCopy {
  return COPIES[lang] ?? COPIES.id;
}
