/**
 * Stock Opname posted-result copy, Bahasa Indonesia first (US12 / RFC 03
 * task 41e / row 50, mockup 6). Self-approved badge lives in
 * stock-count-copy.ts (`selfApprovedBadge`).
 */
import type { StockCountLang } from './stock-count-copy';

export interface StockCountPostedCopy {
  postedTitle: string;
  postedSummary: (posted: number, matched: number, excluded: number) => string;
  ledgerIn: string;
  ledgerOut: string;
  postedBy: string;
  submittedBy: string;
  backToList: string;
}

const id: StockCountPostedCopy = {
  postedTitle: 'Hasil diposting',
  postedSummary: (p, m, e) => `${p} diposting · ${m} cocok · ${e} dikecualikan`,
  ledgerIn: 'ADJ_OPNAME_IN',
  ledgerOut: 'ADJ_OPNAME_OUT',
  postedBy: 'Diposting oleh',
  submittedBy: 'Dikirim oleh',
  backToList: 'Kembali ke daftar opname',
};

const en: StockCountPostedCopy = {
  postedTitle: 'Posted result',
  postedSummary: (p, m, e) => `${p} posted · ${m} matched · ${e} excluded`,
  ledgerIn: 'ADJ_OPNAME_IN',
  ledgerOut: 'ADJ_OPNAME_OUT',
  postedBy: 'Posted by',
  submittedBy: 'Submitted by',
  backToList: 'Back to stock counts',
};

const COPIES: Record<StockCountLang, StockCountPostedCopy> = { id, en };

export function getStockCountPostedCopy(
  lang: StockCountLang = 'id'
): StockCountPostedCopy {
  return COPIES[lang] ?? COPIES.id;
}
