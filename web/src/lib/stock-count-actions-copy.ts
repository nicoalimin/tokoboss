/**
 * Stock Opname actions-bar copy, Bahasa Indonesia first (US12 / RFC 03 task
 * 41d / row 49): submit, post, return, cancel dialogs (mockup 5). Post is
 * Manager/Admin only; Staff see noPostPermission. Posted-result copy is 41e.
 */
import type { StockCountLang } from './stock-count-copy';

export interface StockCountActionsCopy {
  submit: string;
  submitTitle: string;
  submitSubtitle: (counted: number, excluded: number) => string;
  submitNoteLabel: string;
  submitNotePlaceholder: string;
  submitConfirm: string;
  submitting: string;
  post: (n: number) => string;
  postTitle: (n: number) => string;
  postBody: string;
  postConfirm: string;
  posting: string;
  postIrreversible: string;
  noPostPermission: string;
  returnAction: string;
  returnTitle: string;
  returnNoteLabel: string;
  returnConfirm: string;
  cancelSession: string;
  cancelTitle: string;
  cancelReasonLabel: string;
  cancelConfirm: string;
  continueCount: string;
}

const id: StockCountActionsCopy = {
  submit: 'Kirim untuk ditinjau',
  submitTitle: 'Kirim untuk ditinjau',
  submitSubtitle: (c, e) =>
    `${c} SKU dihitung · ${e} belum dihitung akan dikecualikan (tidak dianggap nol).`,
  submitNoteLabel: 'Catatan untuk peninjau',
  submitNotePlaceholder: 'Opsional',
  submitConfirm: 'Kirim',
  submitting: 'Mengirim…',
  post: (n) => `Posting ${n} koreksi`,
  postTitle: (n) => `Posting ${n} koreksi?`,
  postBody: 'Membuat entri ledger immutable. Tidak dapat dibatalkan.',
  postConfirm: 'Posting',
  posting: 'Memposting…',
  postIrreversible:
    'Posting tidak dapat dibatalkan; koreksi dilakukan dengan sesi opname baru.',
  noPostPermission:
    'Anda tidak memiliki izin posting. Kirim untuk ditinjau Manager/Admin.',
  returnAction: 'Kembalikan',
  returnTitle: 'Kembalikan ke penghitung',
  returnNoteLabel: 'Catatan untuk penghitung',
  returnConfirm: 'Kembalikan',
  cancelSession: 'Batalkan sesi',
  cancelTitle: 'Batalkan sesi opname',
  cancelReasonLabel: 'Alasan pembatalan',
  cancelConfirm: 'Batalkan sesi',
  continueCount: 'Lanjutkan hitung',
};

const en: StockCountActionsCopy = {
  submit: 'Submit for review',
  submitTitle: 'Submit for review',
  submitSubtitle: (c, e) =>
    `${c} SKUs counted · ${e} not counted will be excluded (not treated as zero).`,
  submitNoteLabel: 'Note for the reviewer',
  submitNotePlaceholder: 'Optional',
  submitConfirm: 'Submit',
  submitting: 'Submitting…',
  post: (n) => `Post ${n} adjustments`,
  postTitle: (n) => `Post ${n} adjustments?`,
  postBody: 'Creates immutable ledger entries. This cannot be undone.',
  postConfirm: 'Post',
  posting: 'Posting…',
  postIrreversible:
    'Posting cannot be undone; fix mistakes with a new count session.',
  noPostPermission:
    'You do not have permission to post. Submit for Manager/Admin review.',
  returnAction: 'Return',
  returnTitle: 'Return to counting',
  returnNoteLabel: 'Note for counters',
  returnConfirm: 'Return',
  cancelSession: 'Cancel session',
  cancelTitle: 'Cancel count session',
  cancelReasonLabel: 'Cancellation reason',
  cancelConfirm: 'Cancel session',
  continueCount: 'Continue counting',
};

const COPIES: Record<StockCountLang, StockCountActionsCopy> = { id, en };

export function getStockCountActionsCopy(
  lang: StockCountLang = 'id'
): StockCountActionsCopy {
  return COPIES[lang] ?? COPIES.id;
}
