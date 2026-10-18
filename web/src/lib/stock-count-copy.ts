/**
 * Stock Opname UI copy, Bahasa Indonesia first (US12 / RFC 03 task 41a):
 * list page, start form and session shell. Count, review and post strings
 * live in sibling copy files. Keys stay in sync across locales; strings never
 * echo ids or session material, and uncounted items are never called zero.
 */
import type { StockCountStatusWire } from '@tokoboss/contracts';

export type StockCountLang = 'id' | 'en';

export interface StockCountCopy {
  pageTitle: string;
  pageSubtitle: string;
  startButton: string;
  resumeButton: string;
  loading: string;
  emptyTitle: string;
  emptyBody: string;
  selfApprovedBadge: string;
  status: Record<StockCountStatusWire, string>;
  startTitle: string;
  startSubtitle: string;
  warehouseLabel: string;
  scopeLabel: string;
  scopeAll: string;
  scopeSkus: string;
  nameLabel: string;
  snapshotNote: string;
  freezeLabel: string;
  submitStart: string;
  starting: string;
  cancelButton: string;
  backToList: string;
}

const id: StockCountCopy = {
  pageTitle: 'Stock Opname',
  pageSubtitle: 'Hitung stok fisik per gudang, tinjau selisih, lalu posting.',
  startButton: 'Mulai sesi hitung',
  resumeButton: 'Lanjutkan sesi',
  loading: 'Memuat sesi opname…',
  emptyTitle: 'Belum ada sesi opname',
  emptyBody: 'Mulai sesi hitung pertama untuk gudang ini.',
  selfApprovedBadge: 'Disetujui sendiri',
  status: {
    counting: 'Menghitung',
    submitted: 'Menunggu tinjauan',
    posted: 'Diposting',
    cancelled: 'Dibatalkan',
  },
  startTitle: 'Mulai sesi hitung',
  startSubtitle: 'Pilih gudang dan cakupan.',
  warehouseLabel: 'Gudang',
  scopeLabel: 'Cakupan',
  scopeAll: 'Semua SKU di gudang',
  scopeSkus: 'SKU terpilih',
  nameLabel: 'Nama sesi',
  snapshotNote: 'Snapshot stok, bukan pembekuan; penjualan tetap berjalan.',
  freezeLabel: 'Bekukan transfer keluar selama sesi ini',
  submitStart: 'Mulai hitung',
  starting: 'Memulai…',
  cancelButton: 'Batal',
  backToList: 'Kembali ke daftar opname',
};

const en: StockCountCopy = {
  pageTitle: 'Stock count',
  pageSubtitle: 'Count stock per warehouse, review variances, then post.',
  startButton: 'Start count session',
  resumeButton: 'Resume session',
  loading: 'Loading count sessions…',
  emptyTitle: 'No count sessions yet',
  emptyBody: 'Start the first count session for this warehouse.',
  selfApprovedBadge: 'Self-approved',
  status: {
    counting: 'Counting',
    submitted: 'Awaiting review',
    posted: 'Posted',
    cancelled: 'Cancelled',
  },
  startTitle: 'Start count session',
  startSubtitle: 'Choose a warehouse and scope.',
  warehouseLabel: 'Warehouse',
  scopeLabel: 'Scope',
  scopeAll: 'All SKUs in the warehouse',
  scopeSkus: 'Selected SKUs',
  nameLabel: 'Session name',
  snapshotNote: 'A stock snapshot, not a freeze; sales keep running.',
  freezeLabel: 'Freeze outbound transfers during this session',
  submitStart: 'Start counting',
  starting: 'Starting…',
  cancelButton: 'Cancel',
  backToList: 'Back to stock counts',
};

const COPIES: Record<StockCountLang, StockCountCopy> = { id, en };

export function getStockCountCopy(lang: StockCountLang = 'id'): StockCountCopy {
  return COPIES[lang] ?? COPIES.id;
}
